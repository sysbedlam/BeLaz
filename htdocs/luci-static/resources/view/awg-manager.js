'use strict';
'require view';
'require fs';
'require ui';

var VERSION = '0.0.1';

return view.extend({

	currentServer: null,
	serverTab: {},

	load: function() {
		return Promise.all([
			fs.exec('/usr/bin/awg-manager-backend', ['list_servers']).catch(() => ({ stdout: '[]' })),
			fs.stat('/usr/bin/awg').catch(() => null)
		]);
	},

	formatBytes: function(bytes) {
		bytes = parseInt(bytes) || 0;
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
		if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
		return (bytes/1073741824).toFixed(2) + ' GB';
	},

	showMsg: function(text, type) {
		var el = document.getElementById('awg-msg');
		if (!el) return;
		el.textContent = text;
		el.style.display = 'block';
		el.style.background = type === 'ok' ? '#dff0d8' : '#f2dede';
		el.style.color = type === 'ok' ? '#3c763d' : '#a94442';
		setTimeout(function() { el.style.display = 'none'; }, 4000);
	},

	render: function(data) {
		var servers = [];
		try { servers = JSON.parse(data[0].stdout || '[]'); } catch(e) {}
		var awgInstalled = data[1] !== null;
		var self = this;

		if (self.currentServer === null && servers.length > 0)
			self.currentServer = servers[0].name;

		var installBanner = !awgInstalled ? [E('div', { 'class': 'alert-message warning' }, [
			E('h4', {}, _('AmneziaWG not installed')),
			E('p', {}, _('Install via SSH:')),
			E('pre', {}, 'sh <(wget -O - https://raw.githubusercontent.com/Slava-Shchipunov/awg-openwrt/refs/heads/master/amneziawg-install.sh)')
		])] : [];

		// Server selector row
		var serverSelect = E('select', { 'id': 'server-select', 'class': 'cbi-input-select', 'style': 'width:200px',
			'change': function() {
				self.currentServer = this.value;
				self.serverTab[this.value] = self.serverTab[this.value] || 'info';
				self.loadServerView(this.value);
			}
		}, servers.map(function(s) {
			return E('option', { 'value': s.name, 'selected': s.name === self.currentServer },
				s.name + (s.version === '1' ? ' (1.0)' : ' (2.0)'));
		}));

		var selectorRow = E('div', { 'style': 'display:flex;gap:8px;align-items:center;margin-bottom:12px' }, [
			E('label', { 'style': 'font-weight:bold' }, _('Server:')),
			serverSelect,
			E('button', { 'class': 'btn cbi-button cbi-button-add',
				'click': function() { self.showCreateServerForm(); }
			}, '+ ' + _('New server')),
			E('button', { 'class': 'btn cbi-button',
				'style': 'background:#5b7fa6;color:#fff',
				'click': function() { self.showAddressLists(); }
			}, '☰ ' + _('Address Lists'))
		]);

		var serverView = E('div', { 'id': 'server-view' });

		setTimeout(function() {
			// Sync currentServer with what dropdown actually shows
			var sel = document.getElementById('server-select');
			if (sel) {
				sel.value = self.currentServer;
				// If browser overrode our value (e.g. remembered form state), sync back
				if (sel.value !== self.currentServer) {
					self.currentServer = sel.value;
				}
			}
			if (self.currentServer)
				self.loadServerView(self.currentServer);
			else
				serverView.textContent = _('No servers. Create one.');
		}, 50);

		return E('div', {}, [
			E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, [
				E('h2', { 'style': 'margin:0' }, 'BeLaz v' + VERSION),
				E('a', { 'href': 'https://beit24.ru', 'target': '_blank', 'style': 'color:#5b7fa6;font-size:13px;text-decoration:none' }, 'beit24.ru')
			]),
			E('div', { 'id': 'awg-msg', 'style': 'display:none;padding:10px;margin-bottom:10px;border-radius:4px' }),
		].concat(installBanner).concat([
			E('div', { 'class': 'cbi-section' }, [ selectorRow, serverView ])
		]));
	},

	loadServerView: function(name) {
		var self = this;
		var el = document.getElementById('server-view');
		if (!el) return;
		el.innerHTML = '<p>' + _('Loading...') + '</p>';

		Promise.all([
			fs.exec('/usr/bin/awg-manager-backend', ['get_server', name]).catch(() => ({ stdout: 'null' })),
			fs.exec('/usr/bin/awg-manager-backend', ['list_clients', name]).catch(() => ({ stdout: '[]' })),
			fs.exec('/usr/bin/awg-manager-backend', ['peers_stats', name]).catch(() => ({ stdout: '{}' })),
			fs.exec('/usr/bin/awg-manager-backend', ['get_routing']).catch(() => ({ stdout: '{}' })),
			fs.exec('/usr/bin/awg-manager-backend', ['get_interfaces']).catch(() => ({ stdout: '[]' })),
			fs.exec('/usr/bin/awg-manager-backend', ['get_healthcheck']).catch(() => ({ stdout: '{}' })),
			fs.exec('/usr/bin/awg-manager-backend', ['get_lists']).catch(() => ({ stdout: '[]' }))
		]).then(function(res) {
			var srv = null; try { srv = JSON.parse(res[0].stdout); } catch(e) {}
			var clients = []; try { clients = JSON.parse(res[1].stdout || '[]'); } catch(e) {}
			var peersStats = {}; try { peersStats = JSON.parse(res[2].stdout || '{}'); } catch(e) {}
			var routing = { cascades: [], balancers: [], rules: [] };
			try { routing = JSON.parse(res[3].stdout); } catch(e) {}
			var interfaces = []; try { interfaces = JSON.parse(res[4].stdout || '[]'); } catch(e) {}
			var health = {}; try { health = JSON.parse(res[5].stdout || '{}'); } catch(e) {}
			var lists = []; try { lists = JSON.parse(res[6].stdout || '[]'); } catch(e) {}

			el.innerHTML = '';
			el.appendChild(self.renderServerView(name, srv, clients, peersStats, routing, interfaces, health, lists));
		});
	},

	renderServerView: function(name, srv, clients, peersStats, routing, interfaces, health, lists) {
		var self = this;
		var isV2 = !srv || srv.version !== '1';
		var activeTab = self.serverTab[name] || 'info';

		var showTab = function(t) {
			self.serverTab[name] = t;
			['info','clients','routing'].forEach(function(id) {
				var content = document.getElementById('tab-' + id + '-' + name);
				var btn = document.getElementById('btn-' + id + '-' + name);
				if (content) content.style.display = id === t ? 'block' : 'none';
				if (btn) {
					if (id === t) {
						btn.className = 'cbi-tab';
					} else {
						btn.className = 'cbi-tab cbi-tab-disabled';
					}
				}
			});
		};

		// LuCI-style tab headers
		var tabBtns = E('div', { 'class': 'cbi-tabmenu' }, [
			E('li', { 'id': 'btn-info-' + name, 'class': activeTab === 'info' ? 'cbi-tab' : 'cbi-tab cbi-tab-disabled',
				'click': function() { showTab('info'); }
			}, E('a', { 'href': '#' }, _('Information'))),
			E('li', { 'id': 'btn-clients-' + name, 'class': activeTab === 'clients' ? 'cbi-tab' : 'cbi-tab cbi-tab-disabled',
				'click': function() { showTab('clients'); }
			}, E('a', { 'href': '#' }, _('Clients') + (clients.length > 0 ? ' (' + clients.length + ')' : ''))),
			E('li', { 'id': 'btn-routing-' + name, 'class': activeTab === 'routing' ? 'cbi-tab' : 'cbi-tab cbi-tab-disabled',
				'click': function() { showTab('routing'); }
			}, E('a', { 'href': '#' }, _('Routing')))
		]);

		// ── Tab: Information ──
		var tabInfo = E('div', { 'id': 'tab-info-' + name, 'style': activeTab === 'info' ? '' : 'display:none' }, [
			srv ? E('table', { 'class': 'table', 'style': 'margin-bottom:12px' }, [
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left', 'width': '35%' }, _('Version')), E('td', { 'class': 'td' }, 'AmneziaWG ' + (srv.version === '1' ? '1.0' : '2.0')) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Public Key')), E('td', { 'class': 'td' }, [ E('small', { 'style': 'font-family:monospace;word-break:break-all' }, srv.pub_key) ]) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('External IP')), E('td', { 'class': 'td' }, srv.ext_ip) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Port')), E('td', { 'class': 'td' }, srv.port) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, _('Subnet')), E('td', { 'class': 'td' }, srv.subnet + '.0/24') ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, 'Jc / Jmin / Jmax'), E('td', { 'class': 'td' }, srv.jc + ' / ' + srv.jmin + ' / ' + srv.jmax) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, 'S1 / S2' + (isV2 ? ' / S3 / S4' : '')), E('td', { 'class': 'td' }, srv.s1 + ' / ' + srv.s2 + (isV2 ? ' / ' + (srv.s3||0) + ' / ' + (srv.s4||0) : '')) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, 'H1 / H2'), E('td', { 'class': 'td' }, srv.h1 + ' / ' + srv.h2) ]),
				E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, 'H3 / H4'), E('td', { 'class': 'td' }, srv.h3 + ' / ' + srv.h4) ]),
				srv.i1 ? E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td left' }, 'DNS masking'), E('td', { 'class': 'td' }, '✓ enabled') ]) : E('span')
			]) : E('p', {}, _('Server not configured')),
			E('button', { 'class': 'btn cbi-button cbi-button-remove', 'click': function() { self.deleteServer(name); } }, _('Delete server'))
		]);

		// ── Tab: Clients ──
		var clientRows = clients.map(function(c) {
			var stats = peersStats[c.name] || {};
			var connected = stats.last_handshake && (Date.now()/1000 - parseInt(stats.last_handshake)) < 180;
			var badge = E('span', {
				'style': 'padding:2px 8px;border-radius:3px;font-size:11px;font-weight:bold;background:' +
					(connected ? '#dff0d8' : '#f5f5f5') + ';color:' + (connected ? '#3c763d' : '#999')
			}, connected ? _('Online') : _('Offline'));
			var disabled = c.disabled === '1';
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left' }, c.name),
				E('td', { 'class': 'td' }, c.ip),
				E('td', { 'class': 'td' }, [ badge ]),
				E('td', { 'class': 'td' }, 'RX ' + self.formatBytes(parseInt(stats.rx)||0) + ' / TX ' + self.formatBytes(parseInt(stats.tx)||0)),
				E('td', { 'class': 'td' }, [
					E('button', { 'class': 'btn cbi-button btn-sm', 'click': (function(cn) { return function() { self.downloadClient(name, cn); }; })(c.name) }, _('Config')),
					' ',
					E('button', {
						'class': 'btn cbi-button btn-sm' + (disabled ? ' cbi-button-apply' : ''),
						'style': disabled ? '' : 'background:#888;color:#fff',
						'click': (function(cn, dis) { return function() { self.toggleClient(name, cn, dis); }; })(c.name, disabled)
					}, disabled ? _('Enable') : _('Disable')),
					' ',
					E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm',
						'click': (function(cn) { return function() { self.deleteClient(name, cn); }; })(c.name)
					}, _('Delete'))
				])
			]);
		});

		var tabClients = E('div', { 'id': 'tab-clients-' + name, 'style': activeTab === 'clients' ? '' : 'display:none' }, [
			E('div', { 'style': 'margin-bottom:10px;display:flex;gap:8px' }, [
				E('input', { 'id': 'new-client-' + name, 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('Client name (latin)'), 'style': 'width:160px' }),
				E('button', { 'class': 'btn cbi-button cbi-button-add', 'click': function() { self.addClient(name); } }, _('Add client'))
			]),
			clients.length > 0 ? E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, _('Name')),
					E('th', { 'class': 'th' }, 'IP'),
					E('th', { 'class': 'th' }, _('Status')),
					E('th', { 'class': 'th' }, _('Traffic')),
					E('th', { 'class': 'th' }, _('Actions'))
				])
			].concat(clientRows)) : E('p', { 'style': 'color:#999' }, _('No clients'))
		]);

		// ── Tab: Routing ──
		var tabRouting = E('div', { 'id': 'tab-routing-' + name, 'style': activeTab === 'routing' ? '' : 'display:none' });
		tabRouting.appendChild(self.renderRoutingTab(name, routing, interfaces, health, lists));

		return E('div', {}, [
			tabBtns,
			E('div', { 'class': 'cbi-tabcontainer' }, [ tabInfo, tabClients, tabRouting ])
		]);
	},

	// ─── ROUTING TAB ─────────────────────────────────────────
	renderRoutingTab: function(serverName, routing, interfaces, health, lists) {
		var self = this;

		function hBadge(iface) {
			var s = health[iface];
			return E('span', {
				'style': 'padding:1px 5px;border-radius:3px;font-size:10px;margin-right:4px;background:' +
					(s === 'up' ? '#dff0d8' : s === 'down' ? '#f2dede' : '#f5f5f5') + ';color:' +
					(s === 'up' ? '#3c763d' : s === 'down' ? '#a94442' : '#999')
			}, s === 'up' ? '↑' : s === 'down' ? '↓' : '?');
		}

		var ifOpts = function(exclude) {
			return interfaces.filter(function(i) { return i.name !== exclude; }).map(function(i) {
				return E('option', { 'value': i.name }, i.name + (i.type === 'awg' ? ' (awg)' : ''));
			});
		};

		var myCascade = (routing.cascades || []).find(function(c) { return c.from === serverName; });
		var myBalancer = (routing.balancers || []).find(function(b) { return b.from === serverName; });
		var myRules = (routing.rules || []).filter(function(r) { return r.from === serverName; });

		var defMode = 'none';
		if (myCascade) defMode = 'cascade';
		else if (myBalancer) defMode = 'balance';

		// ── Default route section ──
		var cascadeDetail = E('div', { 'id': 'cascade-detail-' + serverName, 'style': defMode === 'cascade' ? 'margin-left:24px;margin-top:8px' : 'display:none;margin-left:24px;margin-top:8px' }, [
			myCascade ? E('div', { 'style': 'display:flex;align-items:center;gap:8px' }, [
				E('strong', {}, '→ ' + myCascade.to),
				E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm',
					'click': function() {
						routing.cascades = (routing.cascades||[]).filter(function(c){ return c.from !== serverName; });
						self.saveRouting(routing, serverName);
					}
				}, _('Remove'))
			]) : E('div', { 'style': 'display:flex;gap:6px;align-items:center' }, [
				E('select', { 'id': 'cas-to-' + serverName, 'class': 'cbi-input-select', 'style': 'width:160px' }, ifOpts(serverName)),
				E('button', { 'class': 'btn cbi-button cbi-button-add',
					'click': function() {
						var to = document.getElementById('cas-to-' + serverName).value;
						if (!to) return;
						routing.cascades = (routing.cascades||[]).filter(function(c){ return c.from !== serverName; });
						routing.cascades.push({ from: serverName, to: to });
						self.saveRouting(routing, serverName);
					}
				}, _('Set'))
			])
		]);

		var balanceDetail = E('div', { 'id': 'balance-detail-' + serverName, 'style': defMode === 'balance' ? 'margin-left:24px;margin-top:8px' : 'display:none;margin-left:24px;margin-top:8px' });
		if (defMode === 'balance') {
			balanceDetail.appendChild(self.renderMwan3Editor(serverName, myBalancer, routing, interfaces));
		}

		var radioNone = E('input', { 'type': 'radio', 'name': 'mode-' + serverName, 'value': 'none' });
		var radioCascade = E('input', { 'type': 'radio', 'name': 'mode-' + serverName, 'value': 'cascade' });
		var radioBalance = E('input', { 'type': 'radio', 'name': 'mode-' + serverName, 'value': 'balance' });

		// Set checked state via DOM property not attribute
		if (defMode === 'none') radioNone.checked = true;
		else if (defMode === 'cascade') radioCascade.checked = true;
		else if (defMode === 'balance') radioBalance.checked = true;
		else radioNone.checked = true;

		radioNone.addEventListener('change', function() {
			document.getElementById('cascade-detail-' + serverName).style.display = 'none';
			document.getElementById('balance-detail-' + serverName).style.display = 'none';
			routing.cascades = (routing.cascades||[]).filter(function(c){ return c.from !== serverName; });
			routing.balancers = (routing.balancers||[]).filter(function(b){ return b.from !== serverName; });
			self.saveRouting(routing, serverName);
		});
		radioCascade.addEventListener('change', function() {
			document.getElementById('cascade-detail-' + serverName).style.display = 'block';
			document.getElementById('balance-detail-' + serverName).style.display = 'none';
			routing.balancers = (routing.balancers||[]).filter(function(b){ return b.from !== serverName; });
		});
		radioBalance.addEventListener('change', function() {
			document.getElementById('cascade-detail-' + serverName).style.display = 'none';
			document.getElementById('balance-detail-' + serverName).style.display = 'block';
			routing.cascades = (routing.cascades||[]).filter(function(c){ return c.from !== serverName; });
			if (!(routing.balancers||[]).find(function(b){ return b.from === serverName; })) {
				routing.balancers = routing.balancers || [];
				var newBal = { name: serverName + '_bal', from: serverName, mode: 'balance', nodes: [] };
				routing.balancers.push(newBal);
				balanceDetail.innerHTML = '';
				balanceDetail.appendChild(self.renderMwan3Editor(serverName, newBal, routing, interfaces));
			}
			self.saveRouting(routing, serverName);
		});

		var modeSection = E('div', { 'style': 'margin-bottom:20px;padding:12px;background:#f9f9f9;border-radius:4px' }, [
			E('strong', {}, _('Default route mode')),
			E('p', { 'style': 'color:#666;font-size:12px;margin:4px 0 10px' }, _('How to route traffic not matching any policy rule')),
			E('div', { 'style': 'margin-bottom:6px' }, [
				E('label', { 'style': 'cursor:pointer;display:flex;align-items:center;gap:8px' }, [ radioNone, E('span', {}, _('None (via WAN)')) ])
			]),
			E('div', { 'style': 'margin-bottom:6px' }, [
				E('label', { 'style': 'cursor:pointer;display:flex;align-items:center;gap:8px' }, [ radioCascade, E('span', {}, _('Cascade')) ]),
				cascadeDetail
			]),
			E('div', {}, [
				E('label', { 'style': 'cursor:pointer;display:flex;align-items:center;gap:8px' }, [ radioBalance, E('span', {}, _('Load balancing / Failover')) ]),
				balanceDetail
			])
		]);

		// ── Policy rules ──
		var ruleRows = myRules.map(function(r) {
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, [
					E('span', { 'style': 'background:#e8f0fe;padding:2px 6px;border-radius:3px;font-size:12px' }, r.list || '?')
				]),
				E('td', { 'class': 'td' }, r.action === 'block'
					? E('span', { 'style': 'color:#a94442;font-weight:bold' }, '⛔ Block')
					: E('span', {}, '→ ' + (r.exit || '?'))
				),
				E('td', { 'class': 'td' }, [
					E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm',
						'click': function() {
							routing.rules = routing.rules.filter(function(x){
								return !(x.from===r.from && x.list===r.list && x.action===r.action);
							});
							self.saveRouting(routing, serverName);
						}
					}, _('Remove'))
				])
			]);
		});

		var listOpts = lists.map(function(l) {
			return E('option', { 'value': l.name }, l.name + ' (' + (l.cidrs||[]).length + ')');
		});

		var actionSel = E('select', { 'id': 'rule-action-' + serverName, 'class': 'cbi-input-select', 'style': 'width:100px',
			'change': function() {
				var exitEl = document.getElementById('rule-exit-' + serverName);
				if (exitEl) exitEl.style.display = this.value === 'block' ? 'none' : '';
			}
		}, [
			E('option', { 'value': 'exit' }, '→ Exit'),
			E('option', { 'value': 'block' }, '⛔ Block')
		]);

		var rulesSection = E('div', {}, [
			E('strong', {}, _('Policy rules')),
			E('p', { 'style': 'color:#666;font-size:12px;margin:4px 0 8px' }, _('Always active. Higher priority than default route.')),
			myRules.length > 0 ? E('table', { 'class': 'table', 'style': 'margin-bottom:8px' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Address list')),
					E('th', { 'class': 'th' }, _('Action')),
					E('th', { 'class': 'th' })
				])
			].concat(ruleRows)) : E('p', { 'style': 'color:#999;font-size:12px' }, _('No rules')),
			lists.length > 0 ? E('div', { 'style': 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px' }, [
				E('select', { 'id': 'rule-list-' + serverName, 'class': 'cbi-input-select', 'style': 'width:150px' }, listOpts),
				actionSel,
				E('select', { 'id': 'rule-exit-' + serverName, 'class': 'cbi-input-select', 'style': 'width:140px' }, ifOpts(serverName)),
				E('button', { 'class': 'btn cbi-button cbi-button-add',
					'click': function() {
						var list = document.getElementById('rule-list-' + serverName).value;
						var action = document.getElementById('rule-action-' + serverName).value;
						var exit = document.getElementById('rule-exit-' + serverName).value;
						if (!list) { self.showMsg(_('Select list'), 'err'); return; }
						routing.rules = routing.rules || [];
						routing.rules.push({ from: serverName, list: list, action: action, exit: action === 'exit' ? exit : '' });
						self.saveRouting(routing, serverName);
					}
				}, _('Add rule'))
			]) : E('div', { 'style': 'margin-top:8px' }, [
				E('p', { 'style': 'color:#999;font-size:12px' }, _('No address lists. ')),
				E('button', { 'class': 'btn cbi-button', 'style': 'background:#5b7fa6;color:#fff',
					'click': function() { self.showAddressLists(); }
				}, '☰ ' + _('Create address list'))
			])
		]);

		return E('div', {}, [ modeSection, E('hr', { 'style': 'margin:16px 0;border:none;border-top:1px solid #eee' }), rulesSection ]);
	},

	renderBalancerEditor: function(serverName, bal, routing, interfaces, health, ifOpts) {
		var self = this;

		if (!bal) {
			bal = { name: serverName + '_bal', from: serverName, mode: 'balance', nodes: [] };
		}

		var realIdx = (routing.balancers||[]).findIndex(function(b) { return b.from === serverName; });

		var nodeRows = (bal.nodes || []).map(function(n, nidx) {
			var s = health[n.iface];
			var badge = E('span', {
				'style': 'padding:1px 6px;border-radius:3px;font-size:11px;background:' +
					(s === 'up' ? '#dff0d8' : s === 'down' ? '#f2dede' : '#f5f5f5') + ';color:' +
					(s === 'up' ? '#3c763d' : s === 'down' ? '#a94442' : '#999')
			}, s || '?');

			return E('div', { 'style': 'display:flex;align-items:center;gap:8px;margin-bottom:4px;margin-left:24px' }, [
				badge,
				E('span', {}, n.iface),
				E('span', { 'style': 'color:#666;font-size:12px' }, 'weight: ' + (n.weight||1)),
				E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm', 'style': 'padding:1px 6px',
					'click': function() {
						routing.balancers[realIdx].nodes.splice(nidx, 1);
						self.saveRouting(routing, serverName);
					}
				}, '✕')
			]);
		});

		return E('div', { 'style': 'margin-left:24px;margin-top:8px' }, [
			E('div', { 'style': 'display:flex;align-items:center;gap:8px;margin-bottom:8px' }, [
				E('label', { 'style': 'font-size:12px;color:#666' }, _('Mode:')),
				E('select', { 'class': 'cbi-input-select', 'style': 'width:120px',
					'change': function() {
						routing.balancers[realIdx].mode = this.value;
						self.saveRouting(routing, serverName);
					}
				}, [
					E('option', { 'value': 'balance', 'selected': bal.mode !== 'failover' }, _('Balance')),
					E('option', { 'value': 'failover', 'selected': bal.mode === 'failover' }, _('Failover'))
				])
			]),
			E('div', {}, nodeRows),
			E('div', { 'style': 'display:flex;gap:4px;margin-top:6px' }, [
				E('select', { 'id': 'bal-iface-' + serverName, 'class': 'cbi-input-select', 'style': 'width:140px;font-size:12px' }, ifOpts(serverName)),
				E('input', { 'id': 'bal-w-' + serverName, 'type': 'number', 'value': '1', 'min': '1', 'max': '10', 'class': 'cbi-input-text', 'style': 'width:45px;font-size:12px' }),
				E('button', { 'class': 'btn cbi-button btn-sm',
					'click': function() {
						var iface = document.getElementById('bal-iface-' + serverName).value;
						var w = parseInt(document.getElementById('bal-w-' + serverName).value) || 1;
						var idx = (routing.balancers||[]).findIndex(function(b) { return b.from === serverName; });
						if (idx === -1) {
							routing.balancers = routing.balancers || [];
							routing.balancers.push({ name: serverName + '_bal', from: serverName, mode: 'balance', nodes: [] });
							idx = routing.balancers.length - 1;
						}
						routing.balancers[idx].nodes.push({ iface: iface, weight: w });
						self.saveRouting(routing, serverName);
					}
				}, '+ ' + _('Add node'))
			])
		]);
	},

	renderMwan3Editor: function(serverName, bal, routing, interfaces) {
		var self = this;
		var nodes = (bal && bal.nodes) || [];
		var mode = (bal && bal.mode) || 'balance';

		var nodeRows = nodes.map(function(n, nidx) {
			return E('div', { 'style': 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, [
				E('span', {}, n.iface),
				mode === 'failover'
					? E('span', { 'style': 'color:#666;font-size:12px' }, _('priority: ') + (nidx+1))
					: E('span', { 'style': 'color:#666;font-size:12px' }, _('weight: ') + (n.weight||1)),
				E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm', 'style': 'padding:1px 6px',
					'click': function() {
						var idx = (routing.balancers||[]).findIndex(function(b){ return b.from === serverName; });
						if (idx >= 0) routing.balancers[idx].nodes.splice(nidx, 1);
						self.saveRouting(routing, serverName);
					}
				}, '✕')
			]);
		});

		var ifOpts = interfaces.filter(function(i){ return i.name !== serverName; }).map(function(i){
			return E('option', { 'value': i.name }, i.name);
		});

		var modeSelect = E('select', { 'class': 'cbi-input-select', 'style': 'width:120px',
			'change': function() {
				var idx = (routing.balancers||[]).findIndex(function(b){ return b.from === serverName; });
				if (idx >= 0) routing.balancers[idx].mode = this.value;
				self.saveRouting(routing, serverName);
			}
		}, [
			E('option', { 'value': 'balance' }, _('Balance')),
			E('option', { 'value': 'failover' }, _('Failover'))
		]);
		setTimeout(function() { modeSelect.value = mode; }, 10);

		return E('div', { 'style': 'margin-top:8px' }, [
			E('div', { 'style': 'display:flex;align-items:center;gap:8px;margin-bottom:8px' }, [
				E('label', { 'style': 'font-size:12px;color:#666' }, _('Mode:')),
				modeSelect,
				E('span', { 'style': 'font-size:11px;color:#999' },
					mode === 'failover' ? _('— first alive node is used') : _('— traffic split by weight'))
			]),
			E('div', {}, nodeRows),
			E('div', { 'style': 'display:flex;gap:4px;margin-top:6px' }, [
				E('select', { 'id': 'mwan-iface-' + serverName, 'class': 'cbi-input-select', 'style': 'width:140px;font-size:12px' }, ifOpts),
				mode !== 'failover' ? E('input', { 'id': 'mwan-w-' + serverName, 'type': 'number', 'value': '1', 'min': '1', 'max': '10', 'class': 'cbi-input-text', 'style': 'width:45px;font-size:12px', 'placeholder': 'w' }) : E('span'),
				E('button', { 'class': 'btn cbi-button btn-sm',
					'click': function() {
						var iface = document.getElementById('mwan-iface-' + serverName).value;
						var wEl = document.getElementById('mwan-w-' + serverName);
						var w = wEl ? parseInt(wEl.value) || 1 : 1;
						var idx = (routing.balancers||[]).findIndex(function(b){ return b.from === serverName; });
						if (idx < 0) {
							routing.balancers = routing.balancers || [];
							routing.balancers.push({ name: serverName+'_bal', from: serverName, mode: mode, nodes: [] });
							idx = routing.balancers.length - 1;
						}
						routing.balancers[idx].nodes.push({ iface: iface, weight: w });
						self.saveRouting(routing, serverName);
					}
				}, '+ ' + _('Add node')),
			]),
			nodes.length > 0 ? E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm', 'style': 'margin-top:8px',
				'click': function() {
					routing.balancers = (routing.balancers||[]).filter(function(b){ return b.from !== serverName; });
					self.saveRouting(routing, serverName);
				}
			}, _('Remove balancer')) : E('span')
		]);
	},

	saveRouting: function(routing, serverName) {
		var self = this;
		self.showMsg(_('Applying routing...'), 'ok');
		self.serverTab[serverName] = 'routing';
		fs.exec('/usr/bin/awg-manager-backend', ['save_routing', JSON.stringify(routing)]).then(function() {
			self.showMsg(_('Done!'), 'ok');
			setTimeout(function() { self.loadServerView(serverName); }, 800);
		});
	},

	showAddressLists: function() {
		var self = this;
		fs.exec('/usr/bin/awg-manager-backend', ['get_lists']).then(function(r) {
			var lists = [];
			try { lists = JSON.parse(r.stdout || '[]'); } catch(e) {}
			self.renderAddressListsModal(lists);
		});
	},

	renderAddressListsModal: function(lists) {
		var self = this;
		var listItems = lists.map(function(lst) {
			return E('div', { 'style': 'border:1px solid #ddd;border-radius:4px;padding:8px;margin-bottom:8px' }, [
				E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px' }, [
					E('strong', {}, lst.name),
					E('div', { 'style': 'display:flex;gap:4px' }, [
						E('button', { 'class': 'btn cbi-button btn-sm',
							'click': function() { ui.hideModal(); self.editAddressList(lst); }
						}, _('Edit')),
						E('button', { 'class': 'btn cbi-button cbi-button-remove btn-sm',
							'click': function() {
								if (!confirm(_('Delete ') + lst.name + '?')) return;
								fs.exec('/usr/bin/awg-manager-backend', ['delete_list', lst.name]).then(function() {
									ui.hideModal(); self.showMsg(_('Deleted'), 'ok');
								});
							}
						}, _('Delete'))
					])
				]),
				E('small', { 'style': 'color:#666' }, (lst.cidrs||[]).length + ' CIDRs')
			]);
		});

		ui.showModal(_('Address Lists'), [
			E('div', { 'style': 'min-width:420px' }, [
				listItems.length > 0 ? E('div', {}, listItems) : E('p', { 'style': 'color:#999' }, _('No lists yet')),
				E('hr'),
				E('button', { 'class': 'btn cbi-button cbi-button-add',
					'click': function() { ui.hideModal(); self.editAddressList(null); }
				}, '+ ' + _('New list'))
			]),
			E('div', { 'style': 'text-align:right;margin-top:8px' }, [
				E('button', { 'class': 'btn cbi-button', 'click': function() { ui.hideModal(); } }, _('Close'))
			])
		]);
	},

	editAddressList: function(lst) {
		var self = this;
		var isNew = !lst;
		var name = lst ? lst.name : '';
		var cidrs = lst ? (lst.cidrs||[]).join('\n') : '';

		ui.showModal(isNew ? _('New address list') : _('Edit: ') + name, [
			E('div', { 'style': 'min-width:460px' }, [
				isNew ? E('div', { 'style': 'margin-bottom:10px' }, [
					E('label', { 'style': 'display:block;margin-bottom:4px;font-weight:bold' }, _('List name')),
					E('input', { 'id': 'al-name', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'Russia', 'style': 'width:100%' })
				]) : E('p', {}, [ E('strong', {}, name) ]),
				E('label', { 'style': 'display:block;margin-bottom:4px;font-weight:bold' }, _('CIDRs (one per line)')),
				E('textarea', {
					'id': 'al-cidrs',
					'style': 'width:100%;height:200px;font-family:monospace;font-size:12px;padding:6px;box-sizing:border-box',
					'placeholder': '1.2.3.0/24\n5.6.7.0/24'
				}, cidrs)
			]),
			E('div', { 'style': 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px' }, [
				E('button', { 'class': 'btn cbi-button', 'click': function() { ui.hideModal(); self.showAddressLists(); } }, _('Cancel')),
				E('button', { 'class': 'btn cbi-button cbi-button-apply', 'click': function() {
					var n = isNew ? document.getElementById('al-name').value.trim() : name;
					var c = document.getElementById('al-cidrs').value.trim();
					if (!n) { alert(_('Enter list name')); return; }
					if (!c) { alert(_('Enter at least one CIDR')); return; }
					var cidrsFlat = c.split('\n').map(function(x){ return x.trim(); }).filter(Boolean).join(',');
					ui.hideModal();
					fs.exec('/usr/bin/awg-manager-backend', ['save_list', n, cidrsFlat]).then(function() {
						self.showMsg(_('Saved!'), 'ok');
					});
				}}, _('Save'))
			])
		]);
	},

	showCreateServerForm: function() {
		var self = this;
		ui.showModal(_('Create new server'), [
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Interface name')),
					E('div', { 'class': 'cbi-value-field' }, [ E('input', { 'id': 'modal-iface', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'awg_work', 'style': 'width:200px' }) ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Protocol version')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('select', { 'id': 'modal-version', 'class': 'cbi-input-select',
							'change': function() {
								var v = this.value;
								document.getElementById('modal-dns-row').style.display = v === '2' ? '' : 'none';
								document.getElementById('modal-adv-v2').style.display = v === '2' ? '' : 'none';
							}
						}, [
							E('option', { 'value': '2' }, 'AmneziaWG 2.0'),
							E('option', { 'value': '1' }, 'AmneziaWG 1.0')
						])
					])
				]),
				E('div', { 'id': 'modal-dns-row', 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, 'DNS masking'),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', { 'id': 'modal-dns', 'type': 'checkbox' }),
						E('small', { 'style': 'margin-left:8px;color:#666' }, _('Mask traffic as DNS (I1)'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Subnet')),
					E('div', { 'class': 'cbi-value-field' }, [ E('input', { 'id': 'modal-subnet', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '172.20.5 (random)', 'style': 'width:200px' }) ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Port')),
					E('div', { 'class': 'cbi-value-field' }, [ E('input', { 'id': 'modal-port', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('random'), 'style': 'width:200px' }) ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Firewall zone')),
					E('div', { 'class': 'cbi-value-field' }, [ E('input', { 'id': 'modal-fw', 'type': 'checkbox', 'checked': true }) ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Advanced')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', { 'id': 'modal-adv', 'type': 'checkbox', 'click': function() {
							document.getElementById('modal-adv-fields').style.display = this.checked ? 'block' : 'none';
						}})
					])
				]),
				E('div', { 'id': 'modal-adv-fields', 'style': 'display:none;border-left:3px solid #ddd;padding-left:10px' }, [
					E('div', {}, [['Jc','modal-jc'],['Jmin','modal-jmin'],['Jmax','modal-jmax'],['S1','modal-s1'],['S2','modal-s2']].map(function(f) {
						return E('div', { 'style': 'display:flex;gap:8px;align-items:center;margin-bottom:4px' }, [
							E('label', { 'style': 'width:50px;font-size:12px' }, f[0]),
							E('input', { 'id': f[1], 'type': 'text', 'class': 'cbi-input-text', 'style': 'width:150px;font-size:12px' })
						]);
					})),
					E('div', { 'id': 'modal-adv-v2' }, [['S3','modal-s3'],['S4','modal-s4']].map(function(f) {
						return E('div', { 'style': 'display:flex;gap:8px;align-items:center;margin-bottom:4px' }, [
							E('label', { 'style': 'width:50px;font-size:12px' }, f[0] + ' (v2)'),
							E('input', { 'id': f[1], 'type': 'text', 'class': 'cbi-input-text', 'style': 'width:150px;font-size:12px' })
						]);
					})),
					E('div', {}, [['H1','modal-h1'],['H2','modal-h2'],['H3','modal-h3'],['H4','modal-h4']].map(function(f) {
						return E('div', { 'style': 'display:flex;gap:8px;align-items:center;margin-bottom:4px' }, [
							E('label', { 'style': 'width:50px;font-size:12px' }, f[0]),
							E('input', { 'id': f[1], 'type': 'text', 'class': 'cbi-input-text', 'style': 'width:220px;font-size:12px' })
						]);
					}))
				])
			]),
			E('div', { 'style': 'display:flex;gap:8px;justify-content:flex-end' }, [
				E('button', { 'class': 'btn cbi-button', 'click': function() { ui.hideModal(); } }, _('Cancel')),
				E('button', { 'class': 'btn cbi-button cbi-button-apply', 'click': function() {
					var iface = document.getElementById('modal-iface').value.trim();
					var version = document.getElementById('modal-version').value;
					var dns = document.getElementById('modal-dns').checked ? 'yes' : 'no';
					var subnet = document.getElementById('modal-subnet').value.trim();
					var port = document.getElementById('modal-port').value.trim();
					var fw = document.getElementById('modal-fw').checked ? 'yes' : 'no';
					if (!iface || !/^[a-zA-Z0-9_]+$/.test(iface)) { alert(_('Invalid name')); return; }
					ui.hideModal();
					self.showMsg(_('Creating...'), 'ok');
					fs.exec('/usr/bin/awg-manager-backend', ['create_server', iface, subnet, fw, port, version, dns]).then(function() {
						self.showMsg(_('Server created!'), 'ok');
						setTimeout(function() { location.reload(); }, 2000);
					});
				}}, _('Create'))
			])
		]);
	},

	deleteServer: function(name) {
		if (!confirm(_('Delete server ') + name + '?')) return;
		var self = this;
		fs.exec('/usr/bin/awg-manager-backend', ['delete_server', name]).then(function() {
			self.showMsg(_('Deleted'), 'ok');
			setTimeout(function() { location.reload(); }, 1500);
		});
	},

	addClient: function(serverName) {
		var el = document.getElementById('new-client-' + serverName);
		var name = el ? el.value.trim() : '';
		if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) { this.showMsg(_('Invalid name'), 'err'); return; }
		var self = this;
		self.showMsg(_('Adding...'), 'ok');
		fs.exec('/usr/bin/awg-manager-backend', ['add_client', serverName, name]).then(function() {
			self.showMsg(_('Client added!'), 'ok');
			if (el) el.value = '';
			self.serverTab[serverName] = 'clients';
			setTimeout(function() { self.loadServerView(serverName); }, 2000);
		});
	},

	toggleClient: function(serverName, clientName, isDisabled) {
		var self = this;
		self.serverTab[serverName] = 'clients';
		fs.exec('/usr/bin/awg-manager-backend', [isDisabled ? 'enable_client' : 'disable_client', serverName, clientName]).then(function() {
			self.showMsg(isDisabled ? _('Enabled') : _('Disabled'), 'ok');
			setTimeout(function() { self.loadServerView(serverName); }, 1500);
		});
	},

	deleteClient: function(serverName, clientName) {
		if (!confirm(_('Delete ') + clientName + '?')) return;
		var self = this;
		self.serverTab[serverName] = 'clients';
		fs.exec('/usr/bin/awg-manager-backend', ['delete_client', serverName, clientName]).then(function() {
			self.showMsg(_('Deleted'), 'ok');
			setTimeout(function() { self.loadServerView(serverName); }, 1500);
		});
	},

	downloadClient: function(serverName, clientName) {
		fs.read('/etc/awg-manager/servers/' + serverName + '/clients/' + clientName + '.conf').then(function(content) {
			var blob = new Blob([content], { type: 'application/octet-stream' });
			var a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = clientName + '.conf';
			a.click();
		}).catch(function(e) { alert(_('Error: ') + e); });
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
