/*
 * SecureVote.js - private AbuseFilter-backed voting helper for MediaWiki.
 * MIT licensed.
 */
(function () {
	'use strict';

	if (window.SecureVoteLoaded) {
		return;
	}
	window.SecureVoteLoaded = true;

	if (typeof mw === 'undefined') {
		return;
	}

	mw.loader.using(['mediawiki.api', 'mediawiki.util']).then(function () {
		var api = new mw.Api();
		var marker = '__SECUREVOTE__';
		var configTitle = 'MediaWiki:SecureVote-config.json';
		var projectNamespaces = mw.config.get('wgFormattedNamespaces') || {};
		var projectNamespace = projectNamespaces[4] || 'Project';
		var submitTitle = projectNamespace + ':SecureVote/Submit';
		var adminSubpageTitle = 'SecureVote/Admin';
		var pageName = mw.config.get('wgPageName');
		var userName = mw.config.get('wgUserName');
		var isView = mw.config.get('wgAction') === 'view';

		injectStyles();

		if (mw.config.get('wgNamespaceNumber') === 4 && mw.config.get('wgTitle') === adminSubpageTitle && isView) {
			bootAdmin();
		}

		if (isView) {
			bootVoter();
		}

		function bootVoter() {
			var anchors = Array.prototype.slice.call(document.querySelectorAll('.securevote-anchor'));
			if (!anchors.length) {
				return;
			}
			if (!userName) {
				anchors.forEach(function (anchor) {
					renderLoginNotice(anchor);
				});
				return;
			}
			getUserRights().then(function (rights) {
				if (rights.indexOf('edit') === -1) {
					anchors.forEach(function (anchor) {
						renderMessage(anchor, '您当前没有编辑权限，不能参与此投票。', 'warn');
					});
					return;
				}
				return loadConfig().then(function (config) {
					anchors.forEach(function (anchor) {
						renderPoll(anchor, config);
					});
				});
			}).catch(function (error) {
				anchors.forEach(function (anchor) {
					renderMessage(anchor, 'SecureVote 加载失败：' + formatError(error), 'error');
				});
			});
		}

		function renderLoginNotice(anchor) {
			renderMessage(anchor, '请登录后参与此匿名投票。', 'warn');
		}

		function renderPoll(anchor, config) {
			var pollId = (anchor.getAttribute('data-securevote-id') || '').trim();
			var poll = config.polls && config.polls[pollId];
			if (!pollId || !poll) {
				renderMessage(anchor, 'SecureVote 配置中找不到此投票。', 'error');
				return;
			}

			var state = getPollState(poll);
			var card = document.createElement('div');
			card.className = 'securevote-card';

			var head = document.createElement('div');
			head.className = 'securevote-head';
			var title = document.createElement('div');
			title.className = 'securevote-title';
			title.textContent = poll.title || pollId;
			var badge = document.createElement('span');
			badge.className = 'securevote-badge';
			badge.textContent = '匿名投票';
			head.appendChild(title);
			head.appendChild(badge);
			card.appendChild(head);

			if (poll.description) {
				var desc = document.createElement('p');
				desc.className = 'securevote-desc';
				desc.textContent = poll.description;
				card.appendChild(desc);
			}

			if (!state.open) {
				var closed = document.createElement('div');
				closed.className = 'securevote-state';
				closed.textContent = state.message;
				card.appendChild(closed);
				replaceAnchor(anchor, card);
				return;
			}

			var form = document.createElement('form');
			form.className = 'securevote-form';
			var options = document.createElement('div');
			options.className = 'securevote-options';
			(poll.options || []).forEach(function (option) {
				var label = document.createElement('label');
				label.className = 'securevote-option';
				var input = document.createElement('input');
				input.type = 'radio';
				input.name = 'securevote-choice';
				input.value = option.id;
				label.appendChild(input);
				var span = document.createElement('span');
				span.textContent = option.label || option.id;
				label.appendChild(span);
				options.appendChild(label);
			});
			form.appendChild(options);

			var reasonBox = null;
			if (poll.allowReason) {
				var field = document.createElement('label');
				field.className = 'securevote-field';
				var fieldTitle = document.createElement('span');
				fieldTitle.textContent = '理由或说明（可选）';
				reasonBox = document.createElement('textarea');
				reasonBox.rows = 3;
				reasonBox.maxLength = 500;
				reasonBox.placeholder = '可填写简短理由；普通用户不会看到他人的理由。';
				field.appendChild(fieldTitle);
				field.appendChild(reasonBox);
				form.appendChild(field);
			}

			var notice = document.createElement('p');
			notice.className = 'securevote-note';
			notice.textContent = '提交后不会显示票数或投票人；授权查验员可在后台查看私有投票日志。重复提交时默认最后一票有效。';
			form.appendChild(notice);

			var actions = document.createElement('div');
			actions.className = 'securevote-actions';
			var submit = document.createElement('button');
			submit.type = 'submit';
			submit.className = 'securevote-submit';
			submit.textContent = '提交投票';
			actions.appendChild(submit);
			form.appendChild(actions);

			form.addEventListener('submit', function (event) {
				event.preventDefault();
				var checked = form.querySelector('input[name="securevote-choice"]:checked');
				if (!checked) {
					renderInlineStatus(card, '请选择一个选项。', 'warn');
					return;
				}
				setBusy(submit, true);
				submitVote(pollId, poll, checked.value, reasonBox ? reasonBox.value : '').then(function () {
					renderInlineStatus(card, '投票已提交并记录到私有票箱。', 'success');
					form.reset();
				}).catch(function (error) {
					renderInlineStatus(card, '提交失败：' + formatError(error), 'error');
				}).then(function () {
					setBusy(submit, false);
				});
			});

			card.appendChild(form);
			replaceAnchor(anchor, card);
		}

		function submitVote(pollId, poll, choice, reason) {
			var optionIds = (poll.options || []).map(function (option) { return option.id; });
			if (optionIds.indexOf(choice) === -1) {
				return Promise.reject(new Error('无效投票选项。'));
			}
			var payload = {
				version: 1,
				tool: 'SecureVote',
				poll: pollId,
				choice: choice,
				reason: String(reason || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500),
				nonce: makeNonce(),
				clientTime: new Date().toISOString()
			};
			var text = marker + '\n' + JSON.stringify(payload, null, 2) + '\n';
			return postWithToken({
				action: 'edit',
				title: submitTitle,
				text: text,
				summary: 'SecureVote：提交私有投票',
				watchlist: 'nochange',
				formatversion: 2
			}).then(function () {
				throw new Error('配置异常：提交未被私有过滤器拦截，可能产生公开修订。');
			}).catch(function (error) {
				if (isAcceptedDisallow(error)) {
					return;
				}
				throw error;
			});
		}

		function bootAdmin() {
			var root = document.querySelector('.securevote-admin');
			if (!root) {
				return;
			}
			if (!userName) {
				renderAdminMessage(root, '请登录后访问 SecureVote 查验后台。', 'warn');
				return;
			}
			Promise.all([getUserRights(), loadConfig()]).then(function (values) {
				var rights = values[0];
				var config = values[1];
				var allowed = rights.indexOf('abusefilter-log-private') !== -1 && rights.indexOf('abusefilter-log-detail') !== -1;
				if (!allowed) {
					renderAdminMessage(root, '您没有查看 SecureVote 私有投票日志的权限。', 'error');
					return;
				}
				renderAdminShell(root, config);
				loadVotes().then(function (items) {
					renderAdminData(root, config, items);
				}).catch(function (error) {
					renderAdminMessage(root, '读取私有投票日志失败：' + formatError(error), 'error');
				});
			}).catch(function (error) {
				renderAdminMessage(root, 'SecureVote 后台加载失败：' + formatError(error), 'error');
			});
		}

		function renderAdminShell(root, config) {
			root.innerHTML = '';
			var box = document.createElement('div');
			box.className = 'securevote-admin-box';
			var title = document.createElement('h2');
			title.textContent = 'SecureVote 查验后台';
			var desc = document.createElement('p');
			desc.textContent = '正在读取私有 AbuseLog。普通用户不会看到此页面中的投票记录。';
			box.appendChild(title);
			box.appendChild(desc);
			root.appendChild(box);
		}

		function loadVotes() {
			var all = [];
			function next(cont) {
				var params = {
					action: 'query',
					list: 'abuselog',
					afllimit: 'max',
					afltitle: submitTitle,
					aflprop: 'ids|user|title|action|result|timestamp|details|filter',
					formatversion: 2
				};
				if (cont) {
					params.aflcontinue = cont;
				}
				return get(params).then(function (data) {
					var entries = data.query && data.query.abuselog ? data.query.abuselog : [];
					all = all.concat(entries);
					if (data.continue && data.continue.aflcontinue) {
						return next(data.continue.aflcontinue);
					}
					return all;
				});
			}
			return next();
		}

		function renderAdminData(root, config, entries) {
			var data = prepareAdminData(config, entries);
			var rootBox = root.querySelector('.securevote-admin-box') || root;
			renderAdminHeader(rootBox);
			var selectedPoll = getSelectedPollId();
			if (selectedPoll && data.pollMap[selectedPoll]) {
				renderPollDetail(rootBox, config, data, selectedPoll);
			} else {
				renderPollList(rootBox, config, data);
			}
		}

		function prepareAdminData(config, entries) {
			var parsed = entries.map(parseEntry).filter(Boolean);
			var valid = [];
			var invalid = [];
			parsed.forEach(function (entry) {
				var poll = config.polls && config.polls[entry.payload.poll];
				var optionIds = poll && poll.options ? poll.options.map(function (option) { return option.id; }) : [];
				if (!poll || optionIds.indexOf(entry.payload.choice) === -1) {
					entry.invalidReason = !poll ? '配置缺失' : '选项无效';
					invalid.push(entry);
				} else {
					valid.push(entry);
				}
			});

			var latest = {};
			valid.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); }).forEach(function (entry) {
				latest[entry.payload.poll + '||' + entry.user] = entry;
			});
			var counted = Object.keys(latest).map(function (key) { return latest[key]; });
			var pollMap = buildPollMap(config, parsed, valid, invalid, counted);
			var pollIds = Object.keys(pollMap).sort(function (a, b) {
				var timeA = pollMap[a].lastTimestamp || (pollMap[a].poll && pollMap[a].poll.start) || '';
				var timeB = pollMap[b].lastTimestamp || (pollMap[b].poll && pollMap[b].poll.start) || '';
				return String(timeB).localeCompare(String(timeA));
			});
			return { parsed: parsed, valid: valid, invalid: invalid, counted: counted, pollMap: pollMap, pollIds: pollIds };
		}

		function buildPollMap(config, parsed, valid, invalid, counted) {
			var map = {};
			Object.keys(config.polls || {}).forEach(function (pollId) {
				ensurePollInfo(map, pollId, config.polls[pollId]);
			});
			parsed.forEach(function (entry) {
				ensurePollInfo(map, entry.payload.poll, config.polls && config.polls[entry.payload.poll]);
			});
			valid.forEach(function (entry) {
				var info = ensurePollInfo(map, entry.payload.poll, config.polls && config.polls[entry.payload.poll]);
				info.validEntries.push(entry);
				info.allSubmissions++;
				if (!info.lastTimestamp || new Date(entry.timestamp) > new Date(info.lastTimestamp)) {
					info.lastTimestamp = entry.timestamp;
				}
			});
			invalid.forEach(function (entry) {
				var info = ensurePollInfo(map, entry.payload.poll, config.polls && config.polls[entry.payload.poll]);
				info.invalidEntries.push(entry);
				info.allSubmissions++;
				if (!info.lastTimestamp || new Date(entry.timestamp) > new Date(info.lastTimestamp)) {
					info.lastTimestamp = entry.timestamp;
				}
			});
			counted.forEach(function (entry) {
				var info = ensurePollInfo(map, entry.payload.poll, config.polls && config.polls[entry.payload.poll]);
				info.countedEntries.push(entry);
			});
			Object.keys(map).forEach(function (pollId) {
				map[pollId].summary = buildSummary(map[pollId].countedEntries, config);
			});
			return map;
		}

		function ensurePollInfo(map, pollId, poll) {
			if (!map[pollId]) {
				map[pollId] = { pollId: pollId, poll: poll || null, validEntries: [], invalidEntries: [], countedEntries: [], allSubmissions: 0, lastTimestamp: '', summary: {} };
			} else if (poll && !map[pollId].poll) {
				map[pollId].poll = poll;
			}
			return map[pollId];
		}

		function renderAdminHeader(rootBox) {
			rootBox.innerHTML = '';
			var title = document.createElement('h2');
			title.textContent = 'SecureVote 查验后台';
			var desc = document.createElement('p');
			desc.textContent = '请选择一个投票项目查看具体计票结果。普通用户不会看到此页面中的投票记录。';
			rootBox.appendChild(title);
			rootBox.appendChild(desc);
		}

		function renderPollList(rootBox, config, data) {
			var section = document.createElement('section');
			section.className = 'securevote-admin-section';
			var h = document.createElement('h3');
			h.textContent = '投票项目列表';
			section.appendChild(h);
			var note = document.createElement('p');
			note.className = 'securevote-admin-note';
			note.textContent = '这里列出已配置或已有提交记录的投票项目，包括未开始、进行中、已结束和已关闭的投票。';
			section.appendChild(note);
			var table = createTable(['投票项目', '状态', '开始时间', '结束时间', '有效票', '全部提交', '异常', '操作']);
			data.pollIds.forEach(function (pollId) {
				var info = data.pollMap[pollId];
				var poll = info.poll;
				var status = getAdminPollStatus(poll);
				var titleBox = document.createElement('div');
				var strong = document.createElement('strong');
				strong.textContent = poll && poll.title ? poll.title : pollId;
				titleBox.appendChild(strong);
				var idLine = document.createElement('div');
				idLine.className = 'securevote-poll-id';
				idLine.textContent = pollId;
				titleBox.appendChild(idLine);
				var statusNode = renderStatusBadge(status);
				var link = document.createElement('a');
				link.href = '#poll=' + encodeURIComponent(pollId);
				link.textContent = '查看计票';
				link.className = 'securevote-admin-link';
				link.addEventListener('click', function (event) {
					event.preventDefault();
					setSelectedPollId(pollId);
					renderAdminData(document.querySelector('.securevote-admin'), config, data.parsed.map(function (entry) { return entry.raw || entry; }));
				});
				addRow(table, [titleBox, statusNode, poll && poll.start ? formatTime(poll.start) : '未设置', poll && poll.end ? formatTime(poll.end) : '未设置', String(info.countedEntries.length), String(info.allSubmissions), String(info.invalidEntries.length), link]);
			});
			if (!data.pollIds.length) {
				addRow(table, ['暂无投票项目', '暂无', '暂无', '暂无', '0', '0', '0', '']);
			}
			section.appendChild(table);
			rootBox.appendChild(section);
		}

		function renderPollDetail(rootBox, config, data, pollId) {
			var info = data.pollMap[pollId];
			var poll = info.poll;
			var status = getAdminPollStatus(poll);
			var toolbar = document.createElement('div');
			toolbar.className = 'securevote-admin-toolbar';
			var back = document.createElement('a');
			back.href = '#';
			back.textContent = '返回投票项目列表';
			back.className = 'securevote-admin-link';
			back.addEventListener('click', function (event) {
				event.preventDefault();
				clearSelectedPollId();
				renderAdminData(document.querySelector('.securevote-admin'), config, data.parsed.map(function (entry) { return entry.raw || entry; }));
			});
			toolbar.appendChild(back);
			rootBox.appendChild(toolbar);

			var head = document.createElement('section');
			head.className = 'securevote-admin-section securevote-poll-head';
			var h = document.createElement('h3');
			h.textContent = poll && poll.title ? poll.title : pollId;
			head.appendChild(h);
			head.appendChild(renderStatusBadge(status));
			var meta = document.createElement('div');
			meta.className = 'securevote-poll-meta';
			meta.textContent = '投票 ID：' + pollId + '；开始：' + (poll && poll.start ? formatTime(poll.start) : '未设置') + '；结束：' + (poll && poll.end ? formatTime(poll.end) : '未设置') + '；有效票：' + info.countedEntries.length + '；全部提交：' + info.allSubmissions + '。';
			head.appendChild(meta);
			if (poll && poll.description) {
				var desc = document.createElement('p');
				desc.textContent = poll.description;
				head.appendChild(desc);
			}
			rootBox.appendChild(head);

			rootBox.appendChild(renderSummary(info.summary, config, pollId));
			rootBox.appendChild(renderEntries('有效投票（最后一票有效）', info.countedEntries, config));
			rootBox.appendChild(renderEntries('全部可解析提交', info.validEntries, config));
			if (info.invalidEntries.length) {
				rootBox.appendChild(renderEntries('异常提交', info.invalidEntries, config));
			}
			rootBox.appendChild(renderCsvButton(info.countedEntries, config, pollId));
		}

		function getSelectedPollId() {
			var hash = window.location.hash || '';
			if (hash.indexOf('#poll=') !== 0) {
				return '';
			}
			return decodeURIComponent(hash.slice(6));
		}

		function setSelectedPollId(pollId) {
			if (history && history.pushState) {
				history.pushState(null, document.title, '#poll=' + encodeURIComponent(pollId));
			} else {
				window.location.hash = 'poll=' + encodeURIComponent(pollId);
			}
		}

		function clearSelectedPollId() {
			if (history && history.pushState) {
				history.pushState(null, document.title, window.location.pathname + window.location.search);
			} else {
				window.location.hash = '';
			}
		}

		function getAdminPollStatus(poll) {
			if (!poll) {
				return { label: '配置缺失', type: 'missing' };
			}
			if (poll.enabled === false) {
				return { label: '已关闭', type: 'closed' };
			}
			if (!poll.options || !poll.options.length) {
				return { label: '配置异常', type: 'error' };
			}
			var now = new Date();
			if (poll.start && now < new Date(poll.start)) {
				return { label: '未开始', type: 'future' };
			}
			if (poll.end && now > new Date(poll.end)) {
				return { label: '已结束', type: 'ended' };
			}
			return { label: '正在进行中', type: 'open' };
		}

		function renderStatusBadge(status) {
			var span = document.createElement('span');
			span.className = 'securevote-admin-status securevote-status-' + status.type;
			span.textContent = status.label;
			return span;
		}

		function parseEntry(entry) {
			var payload = extractPayload(entry.details);
			if (!payload) {
				return null;
			}
			return {
				id: entry.id,
				filter: entry.filter,
				user: entry.user || '(unknown)',
				timestamp: entry.timestamp,
				result: entry.result,
				payload: payload,
				raw: entry
			};
		}

		function extractPayload(details) {
			var strings = [];
			collectStrings(details, strings);
			for (var i = 0; i < strings.length; i++) {
				var text = strings[i];
				var idx = text.indexOf(marker);
				if (idx === -1) {
					continue;
				}
				var jsonStart = text.indexOf('{', idx);
				if (jsonStart === -1) {
					continue;
				}
				var jsonText = text.slice(jsonStart).trim();
				try {
					return JSON.parse(jsonText);
				} catch (e) {
					var match = jsonText.match(/{[\s\S]*}/);
					if (match) {
						try {
							return JSON.parse(match[0]);
						} catch (ignore) {}
					}
				}
			}
			return null;
		}

		function collectStrings(value, out) {
			if (value == null) {
				return;
			}
			if (typeof value === 'string') {
				out.push(value);
				return;
			}
			if (Array.isArray(value)) {
				value.forEach(function (item) { collectStrings(item, out); });
				return;
			}
			if (typeof value === 'object') {
				Object.keys(value).forEach(function (key) { collectStrings(value[key], out); });
			}
		}

		function buildSummary(entries, config) {
			var summary = {};
			entries.forEach(function (entry) {
				var pollId = entry.payload.poll;
				if (!summary[pollId]) {
					summary[pollId] = { total: 0, choices: {} };
				}
				summary[pollId].total++;
				summary[pollId].choices[entry.payload.choice] = (summary[pollId].choices[entry.payload.choice] || 0) + 1;
			});
			return summary;
		}

		function renderSummary(summary, config, selectedPollId) {
			var wrap = document.createElement('section');
			wrap.className = 'securevote-admin-section';
			var pollIds = selectedPollId ? [selectedPollId] : Object.keys(summary);
			var firstPollId = pollIds[0];
			var firstItem = firstPollId ? (summary[firstPollId] || { total: 0, choices: {} }) : { total: 0, choices: {} };
			var h = document.createElement('h3');
			h.textContent = selectedPollId ? '汇总（有效票合计：' + firstItem.total + '）' : '汇总';
			wrap.appendChild(h);
			if (selectedPollId) {
				var note = document.createElement('p');
				note.className = 'securevote-admin-note';
				note.textContent = '有效票合计是当前投票计入结果的总票数；下表票数是各选项分别获得的有效票。';
				wrap.appendChild(note);
			}
			var table = createTable(selectedPollId ? ['选项', '票数', '占比'] : ['投票', '选项', '票数']);
			pollIds.forEach(function (pollId) {
				var poll = config.polls && config.polls[pollId];
				var item = summary[pollId] || { total: 0, choices: {} };
				var options = poll && poll.options ? poll.options : Object.keys(item.choices).map(function (id) { return { id: id, label: id }; });
				if (!options.length) {
					options = [{ id: '', label: '暂无有效选项' }];
				}
				options.forEach(function (option) {
					var count = item.choices[option.id] || 0;
					if (selectedPollId) {
						addRow(table, [option.label || option.id, String(count), formatPercent(count, item.total)]);
					} else {
						addRow(table, [poll ? poll.title : pollId, option.label || option.id, String(count)]);
					}
				});
			});
			if (!pollIds.length) {
				addRow(table, selectedPollId ? ['暂无', '0', '0%'] : ['暂无', '暂无', '0']);
			}
			wrap.appendChild(table);
			return wrap;
		}

		function formatPercent(count, total) {
			if (!total) {
				return '0%';
			}
			var value = Math.round((count / total) * 1000) / 10;
			return String(value).replace(/\.0$/, '') + '%';
		}

		function renderEntries(title, entries, config) {
			var wrap = document.createElement('section');
			wrap.className = 'securevote-admin-section';
			var h = document.createElement('h3');
			h.textContent = title;
			wrap.appendChild(h);
			var table = createTable(['时间', '用户', '投票', '选择', '理由', '日志']);
			entries.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).forEach(function (entry) {
				var poll = config.polls && config.polls[entry.payload.poll];
				var option = findOption(poll, entry.payload.choice);
				addRow(table, [formatTime(entry.timestamp), entry.user, poll ? poll.title : entry.payload.poll, option ? option.label : entry.payload.choice, entry.invalidReason || entry.payload.reason || '', '#' + entry.id]);
			});
			if (!entries.length) {
				addRow(table, ['暂无', '暂无', '暂无', '暂无', '', '']);
			}
			wrap.appendChild(table);
			return wrap;
		}

		function renderCsvButton(entries, config, pollId) {
			var box = document.createElement('div');
			box.className = 'securevote-admin-actions';
			var button = document.createElement('button');
			button.type = 'button';
			button.textContent = '导出此投票有效票 CSV';
			button.addEventListener('click', function () {
				var csv = toCsv(entries, config);
				var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url;
				a.download = 'securevote-' + sanitizeFilename(pollId || 'results') + '.csv';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			});
			box.appendChild(button);
			return box;
		}

		function toCsv(entries, config) {
			var rows = [['timestamp', 'user', 'poll', 'pollTitle', 'choice', 'choiceLabel', 'reason', 'logId']];
			entries.forEach(function (entry) {
				var poll = config.polls && config.polls[entry.payload.poll];
				var option = findOption(poll, entry.payload.choice);
				rows.push([entry.timestamp, entry.user, entry.payload.poll, poll ? poll.title : '', entry.payload.choice, option ? option.label : '', entry.payload.reason || '', entry.id]);
			});
			return rows.map(function (row) { return row.map(csvCell).join(','); }).join('\n');
		}

		function csvCell(value) {
			var text = String(value == null ? '' : value);
			return '"' + text.replace(/"/g, '""') + '"';
		}

		function sanitizeFilename(value) {
			return String(value || 'results').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'results';
		}

		function findOption(poll, choice) {
			if (!poll || !poll.options) {
				return null;
			}
			return poll.options.filter(function (option) { return option.id === choice; })[0] || null;
		}

		function createTable(headers) {
			var table = document.createElement('table');
			table.className = 'securevote-table';
			var thead = document.createElement('thead');
			var tr = document.createElement('tr');
			headers.forEach(function (header) {
				var th = document.createElement('th');
				th.textContent = header;
				tr.appendChild(th);
			});
			thead.appendChild(tr);
			table.appendChild(thead);
			table.appendChild(document.createElement('tbody'));
			return table;
		}

		function addRow(table, cells) {
			var tr = document.createElement('tr');
			cells.forEach(function (cell) {
				var td = document.createElement('td');
				if (cell && typeof cell === 'object' && cell.nodeType) {
					td.appendChild(cell);
				} else {
					td.textContent = cell;
				}
				tr.appendChild(td);
			});
			table.querySelector('tbody').appendChild(tr);
		}

		function renderAdminMessage(root, message, type) {
			root.innerHTML = '';
			var box = document.createElement('div');
			box.className = 'securevote-message securevote-' + (type || 'info');
			box.textContent = message;
			root.appendChild(box);
		}

	function loadConfig() {
			return get({
				action: 'query',
				prop: 'revisions',
				titles: configTitle,
				rvprop: 'content|timestamp',
				rvslots: 'main',
				formatversion: 2
			}).then(function (data) {
				var page = data.query && data.query.pages && data.query.pages[0];
				var rev = page && page.revisions && page.revisions[0];
				var text = rev && rev.slots && rev.slots.main && rev.slots.main.content;
				if (!text) {
					throw new Error('配置页为空。');
				}
				return JSON.parse(text);
			});
		}

		function getUserRights() {
			return get({ action: 'query', meta: 'userinfo', uiprop: 'rights|groups', formatversion: 2 }).then(function (data) {
				return data.query && data.query.userinfo && data.query.userinfo.rights ? data.query.userinfo.rights : [];
			});
		}

		function get(params) {
			return Promise.resolve(api.get(params));
		}

		function postWithToken(params) {
			return Promise.resolve(api.postWithToken('csrf', params));
		}

		function getPollState(poll) {
			if (poll.enabled === false) {
				return { open: false, message: '此投票当前未启用。' };
			}
			var now = new Date();
			if (poll.start && now < new Date(poll.start)) {
				return { open: false, message: '此投票尚未开始。' };
			}
			if (poll.end && now > new Date(poll.end)) {
				return { open: false, message: '此投票已经结束。' };
			}
			if (!poll.options || !poll.options.length) {
				return { open: false, message: '此投票没有配置选项。' };
			}
			return { open: true, message: '' };
		}

		function replaceAnchor(anchor, node) {
			anchor.innerHTML = '';
			anchor.appendChild(node);
		}

		function renderMessage(anchor, message, type) {
			var box = document.createElement('div');
			box.className = 'securevote-message securevote-' + (type || 'info');
			box.textContent = message;
			replaceAnchor(anchor, box);
		}

		function renderInlineStatus(card, message, type) {
			var status = card.querySelector('.securevote-inline-status');
			if (!status) {
				status = document.createElement('div');
				status.className = 'securevote-inline-status';
				card.appendChild(status);
			}
			status.className = 'securevote-inline-status securevote-' + (type || 'info');
			status.textContent = message;
		}

		function setBusy(button, busy) {
			button.disabled = busy;
			button.textContent = busy ? '提交中...' : '提交投票';
		}

		function isAcceptedDisallow(error) {
			var text = formatError(error);
			return text.indexOf('abusefilter-disallowed') !== -1 || text.indexOf('securevote-vote-received') !== -1 || text.indexOf('投票已接收') !== -1;
		}

		function makeNonce() {
			if (window.crypto && window.crypto.getRandomValues) {
				var bytes = new Uint32Array(4);
				window.crypto.getRandomValues(bytes);
				return Array.prototype.map.call(bytes, function (n) { return n.toString(36); }).join('');
			}
			return String(Date.now()) + String(Math.random()).slice(2);
		}

		function formatError(error) {
			if (!error) {
				return '未知错误';
			}
			if (typeof error === 'string') {
				return error;
			}
			if (error.error && error.error.info) {
				return error.error.info;
			}
			if (error.info) {
				return error.info;
			}
			if (error.message) {
				return error.message;
			}
			try {
				return JSON.stringify(error);
			} catch (e) {
				return String(error);
			}
		}

		function formatTime(value) {
			try {
				return new Date(value).toLocaleString();
			} catch (e) {
				return value;
			}
		}

		function injectStyles() {
			mw.util.addCSS('.securevote-anchor{display:block;margin:12px 0}.securevote-card{border:1px solid #d8e0e8;border-radius:8px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.06);padding:18px 20px;max-width:720px;color:#1f2937}.securevote-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #edf1f5;padding-bottom:10px;margin-bottom:12px}.securevote-title{font-size:20px;font-weight:800;color:#0f172a}.securevote-badge{font-size:12px;color:#1f4f82;background:#eef6ff;border:1px solid #cfe0f5;border-radius:999px;padding:3px 9px;white-space:nowrap}.securevote-desc{color:#475569;margin:0 0 12px;line-height:1.65}.securevote-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}.securevote-option{display:flex;align-items:center;gap:8px;border:1px solid #d8e0e8;border-radius:7px;background:#f8fafc;padding:10px 12px;cursor:pointer}.securevote-option input{margin:0}.securevote-option:has(input:checked){border-color:#1f4f82;background:#eef6ff}.securevote-field{display:block;margin:14px 0}.securevote-field>span{display:block;font-weight:700;color:#334155;margin-bottom:6px}.securevote-field textarea{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:9px 10px;line-height:1.5;resize:vertical}.securevote-note{font-size:13px;color:#64748b;line-height:1.65;margin:10px 0}.securevote-actions{display:flex;justify-content:flex-end;margin-top:12px}.securevote-submit,.securevote-admin-actions button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:7px;padding:8px 16px;font-weight:700;cursor:pointer}.securevote-submit:disabled{opacity:.65;cursor:wait}.securevote-message,.securevote-inline-status,.securevote-state{border:1px solid #d8e0e8;border-radius:7px;background:#f8fafc;color:#334155;padding:10px 12px;line-height:1.6;margin:10px 0}.securevote-success{border-color:#bbdfca;background:#f0f9f3;color:#166534}.securevote-warn{border-color:#ead99a;background:#fffbea;color:#854d0e}.securevote-error{border-color:#efc0c0;background:#fff5f5;color:#991b1b}.securevote-admin{max-width:1100px;margin:0 auto}.securevote-admin-box{border:1px solid #d8e0e8;border-radius:8px;background:#fff;padding:20px;box-shadow:0 10px 28px rgba(15,23,42,.06)}.securevote-admin-box h2{margin:0 0 8px;font-size:26px}.securevote-admin-section{margin-top:22px;overflow-x:auto}.securevote-admin-section h3{margin:0 0 10px;font-size:20px}.securevote-table{width:100%;border-collapse:collapse;font-size:14px}.securevote-table th,.securevote-table td{border:1px solid #e1e7ef;padding:8px 10px;text-align:left;vertical-align:top}.securevote-table th{background:#f8fafc;color:#334155}.securevote-admin-actions{margin-top:18px}@media(max-width:640px){.securevote-card{padding:16px}.securevote-head{align-items:flex-start;flex-direction:column}.securevote-options{grid-template-columns:1fr}.securevote-actions{justify-content:stretch}.securevote-submit{width:100%}.securevote-admin-box{padding:14px}.securevote-table{font-size:13px}}');
			mw.util.addCSS('.securevote-admin-note{color:#64748b;margin:6px 0 12px}.securevote-admin-toolbar{margin:14px 0}.securevote-admin-link{display:inline-flex;align-items:center;border:1px solid #cbd5e1;background:#f8fafc;color:#1f4f82;border-radius:7px;padding:6px 10px;font-weight:700;text-decoration:none}.securevote-admin-link:hover{background:#eef6ff;text-decoration:none}.securevote-admin-status{display:inline-flex;align-items:center;border-radius:999px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;padding:3px 9px;font-size:12px;font-weight:800;white-space:nowrap}.securevote-status-open{border-color:#bbdfca;background:#f0f9f3;color:#166534}.securevote-status-ended{border-color:#d8e0e8;background:#f1f5f9;color:#475569}.securevote-status-future{border-color:#cfe0f5;background:#eef6ff;color:#1f4f82}.securevote-status-closed,.securevote-status-missing{border-color:#ead99a;background:#fffbea;color:#854d0e}.securevote-status-error{border-color:#efc0c0;background:#fff5f5;color:#991b1b}.securevote-poll-id{font-size:12px;color:#64748b;margin-top:2px}.securevote-poll-head{border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;padding:14px 16px}.securevote-poll-head h3{display:inline-block;margin-right:10px}.securevote-poll-meta{color:#64748b;font-size:13px;margin-top:8px;line-height:1.6}@media(max-width:640px){.securevote-admin-link{width:100%;justify-content:center;box-sizing:border-box}.securevote-admin-status{white-space:normal}.securevote-poll-head{padding:12px}}');
		}
	});
}());
