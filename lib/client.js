window.__ModuleLoader__.load({
	id: "dsh-kdocs-browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/icons.tsx
		const COLORS = {
			folder: "#4A90E2",
			otl: "#8B5CF6",
			ksheet: "#22A06B",
			form: "#14B8A6",
			word: "#2B6CB0",
			ppt: "#DD6B20",
			sheet: "#38A169",
			pdf: "#E53E3E",
			dbt: "#0F766E",
			file: "#64748B"
		};
		function extOf(item) {
			const type = (item.type || "").toLowerCase();
			if (type === "folder" || type === "dir") return "folder";
			const suffix = (item.suffix || "").toLowerCase().replace(/^\./, "");
			if (suffix) return suffix;
			const name = item.name || "";
			const dot = name.lastIndexOf(".");
			if (dot <= 0) return "";
			return name.slice(dot + 1).toLowerCase();
		}
		function kindOf(item) {
			const ext = extOf(item);
			if (ext === "folder") return "folder";
			if (ext === "otl") return "otl";
			if (ext === "ksheet") return "ksheet";
			if (ext === "form" || ext === "pof") return "form";
			if (ext === "doc" || ext === "docx" || ext === "wdoc" || ext === "wps") return "word";
			if (ext === "ppt" || ext === "pptx" || ext === "wppt" || ext === "dps") return "ppt";
			if (ext === "xls" || ext === "xlsx" || ext === "et") return "sheet";
			if (ext === "pdf") return "pdf";
			if (ext === "dbt") return "dbt";
			return "file";
		}
		function glyph(kind) {
			if (kind === "word") return "W";
			if (kind === "ppt") return "P";
			if (kind === "sheet") return "S";
			if (kind === "pdf") return "P";
			return "";
		}
		function TypeIcon(props) {
			const size = props.size ?? 16;
			const kind = props.kind;
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				"aria-hidden": true,
				style: { flexShrink: 0 }
			}, (0, react.createElement)("rect", {
				x: .5,
				y: .5,
				width: 15,
				height: 15,
				rx: 3,
				fill: COLORS[kind]
			}), kind === "folder" ? (0, react.createElement)("path", {
				d: "M3 5.2h4.1l.8 1.1H13V12H3V5.2z",
				fill: "#fff"
			}) : null, kind === "otl" ? (0, react.createElement)("g", {
				stroke: "#fff",
				strokeWidth: 1.4,
				strokeLinecap: "round"
			}, (0, react.createElement)("line", {
				x1: 4,
				y1: 5.2,
				x2: 12,
				y2: 5.2
			}), (0, react.createElement)("line", {
				x1: 4,
				y1: 8,
				x2: 10.5,
				y2: 8
			}), (0, react.createElement)("line", {
				x1: 4,
				y1: 10.8,
				x2: 11.2,
				y2: 10.8
			})) : null, kind === "ksheet" ? (0, react.createElement)("path", {
				d: "M4.2 4.2h7.6v7.6H4.2z M8 4.2v7.6 M4.2 8h7.6",
				fill: "none",
				stroke: "#fff",
				strokeWidth: 1.2
			}) : null, kind === "form" ? (0, react.createElement)("g", {
				fill: "none",
				stroke: "#fff",
				strokeWidth: 1.3
			}, (0, react.createElement)("rect", {
				x: 4.2,
				y: 4.2,
				width: 7.6,
				height: 7.6,
				rx: 1
			}), (0, react.createElement)("path", {
				d: "M6 8.2l1.3 1.4 2.8-3.2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})) : null, kind === "dbt" ? (0, react.createElement)("g", { fill: "#fff" }, (0, react.createElement)("rect", {
				x: 3.2,
				y: 3.6,
				width: 6.2,
				height: 3.2,
				rx: .6
			}), (0, react.createElement)("rect", {
				x: 6.4,
				y: 6.4,
				width: 6.2,
				height: 3.2,
				rx: .6
			}), (0, react.createElement)("rect", {
				x: 3.8,
				y: 9.4,
				width: 6.2,
				height: 3.2,
				rx: .6
			})) : null, kind === "file" ? (0, react.createElement)("path", {
				d: "M5 3.4h4.2L12 6.2V12.6H5z",
				fill: "#fff"
			}) : null, glyph(kind) ? (0, react.createElement)("text", {
				x: 8,
				y: 11.2,
				textAnchor: "middle",
				fill: "#fff",
				fontSize: kind === "pdf" ? 8 : 9,
				fontWeight: 700,
				fontFamily: "system-ui, sans-serif"
			}, glyph(kind)) : null);
		}
		//#endregion
		//#region src/client/markdown.ts
		/** Compact markdown → HTML. Output only contains renderer tags (source is escaped). */
		function escapeHtml(text) {
			return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		}
		function safeUrl(raw) {
			const trimmed = raw.trim();
			if (trimmed === "") return null;
			if (trimmed.startsWith("#")) return trimmed;
			const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
			if (scheme === null) return trimmed;
			const name = scheme[1].toLowerCase();
			return name === "http" || name === "https" || name === "mailto" ? trimmed : null;
		}
		function renderInline(text) {
			let out = "";
			let i = 0;
			const n = text.length;
			while (i < n) {
				const char = text[i];
				if (char === "`") {
					const end = text.indexOf("`", i + 1);
					if (end !== -1) {
						out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
						i = end + 1;
						continue;
					}
				}
				if (char === "!" && text[i + 1] === "[") {
					const close = text.indexOf("](", i + 2);
					if (close !== -1) {
						const parenEnd = text.indexOf(")", close + 2);
						if (parenEnd !== -1) {
							const alt = text.slice(i + 2, close);
							const safe = safeUrl(text.slice(close + 2, parenEnd));
							if (safe === null) out += escapeHtml(alt);
							else {
								const srcEsc = escapeHtml(safe).replace(/\s+/g, "%20");
								out += `<img alt="${escapeHtml(alt)}" src="${srcEsc}" />`;
							}
							i = parenEnd + 1;
							continue;
						}
					}
				}
				if (char === "[") {
					const close = text.indexOf("](", i + 1);
					if (close !== -1) {
						const parenEnd = text.indexOf(")", close + 2);
						if (parenEnd !== -1) {
							const label = text.slice(i + 1, close);
							const safe = safeUrl(text.slice(close + 2, parenEnd));
							if (safe === null) out += renderInline(label);
							else out += `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${renderInline(label)}</a>`;
							i = parenEnd + 1;
							continue;
						}
					}
				}
				if (char === "*" && text[i + 1] === "*") {
					const end = text.indexOf("**", i + 2);
					if (end !== -1) {
						out += `<strong>${renderInline(text.slice(i + 2, end))}</strong>`;
						i = end + 2;
						continue;
					}
				}
				if (char === "*" && text[i - 1] !== "*" && text[i + 1] !== "*") {
					const end = text.indexOf("*", i + 1);
					if (end !== -1 && text[end + 1] !== "*") {
						out += `<em>${renderInline(text.slice(i + 1, end))}</em>`;
						i = end + 1;
						continue;
					}
				}
				if (char === "~" && text[i + 1] === "~") {
					const end = text.indexOf("~~", i + 2);
					if (end !== -1) {
						out += `<del>${renderInline(text.slice(i + 2, end))}</del>`;
						i = end + 2;
						continue;
					}
				}
				out += escapeHtml(char);
				i += 1;
			}
			return out;
		}
		function renderMarkdown(source) {
			const lines = source.replace(/\r\n/g, "\n").split("\n");
			const out = [];
			let i = 0;
			const n = lines.length;
			const flushParagraph = (buffer) => {
				if (buffer.length === 0) return;
				out.push(`<p>${renderInline(buffer.join("\n"))}</p>`);
				buffer.length = 0;
			};
			const paragraph = [];
			while (i < n) {
				const line = lines[i];
				const fence = /^```([\w+-]*)\s*$/.exec(line);
				if (fence !== null) {
					flushParagraph(paragraph);
					const lang = fence[1] ?? "";
					i += 1;
					const code = [];
					while (i < n && !/^```\s*$/.test(lines[i])) {
						code.push(lines[i]);
						i += 1;
					}
					i += 1;
					const langAttr = lang === "" ? "" : ` class="language-${escapeHtml(lang)}"`;
					out.push(`<pre${langAttr}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
					continue;
				}
				const heading = /^(#{1,6})\s+(.*)$/.exec(line);
				if (heading !== null) {
					flushParagraph(paragraph);
					const level = heading[1].length;
					out.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
					i += 1;
					continue;
				}
				if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
					flushParagraph(paragraph);
					out.push("<hr />");
					i += 1;
					continue;
				}
				if (line.includes("|") && i + 1 < n && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
					flushParagraph(paragraph);
					const headerCells = splitTableRow(line);
					i += 2;
					const rows = [];
					while (i < n && lines[i].includes("|")) {
						rows.push(splitTableRow(lines[i]));
						i += 1;
					}
					out.push("<table>");
					out.push(`<thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`);
					if (rows.length > 0) out.push(`<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`);
					out.push("</table>");
					continue;
				}
				if (/^>\s?(.*)$/.exec(line) !== null) {
					flushParagraph(paragraph);
					const body = [];
					while (i < n) {
						const q = /^>\s?(.*)$/.exec(lines[i]);
						if (q === null) break;
						body.push(q[1] ?? "");
						i += 1;
					}
					out.push(`<blockquote><p>${body.map((item) => renderInline(item)).join("<br />")}</p></blockquote>`);
					continue;
				}
				if (/^\s*([-*+])\s+(.*)$/.exec(line) !== null) {
					flushParagraph(paragraph);
					const items = [];
					while (i < n) {
						const item = /^\s*([-*+])\s+(.*)$/.exec(lines[i]);
						if (item === null) break;
						items.push(`<li>${renderInline(item[2] ?? "")}</li>`);
						i += 1;
					}
					out.push(`<ul>${items.join("")}</ul>`);
					continue;
				}
				if (/^\s*\d+[.)]\s+(.*)$/.exec(line) !== null) {
					flushParagraph(paragraph);
					const items = [];
					while (i < n) {
						const item = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]);
						if (item === null) break;
						items.push(`<li>${renderInline(item[1] ?? "")}</li>`);
						i += 1;
					}
					out.push(`<ol>${items.join("")}</ol>`);
					continue;
				}
				if (line.trim() === "") {
					flushParagraph(paragraph);
					i += 1;
					continue;
				}
				paragraph.push(line);
				i += 1;
			}
			flushParagraph(paragraph);
			return out.join("\n");
		}
		function splitTableRow(line) {
			const trimmed = line.trim();
			const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
			const withoutTrailing = inner.endsWith("|") ? inner.slice(0, -1) : inner;
			const cells = [];
			let current = "";
			let escaped = false;
			for (const char of withoutTrailing) if (escaped) {
				current += char;
				escaped = false;
			} else if (char === "\\") escaped = true;
			else if (char === "|") {
				cells.push(current.trim());
				current = "";
			} else current += char;
			if (escaped) current += "\\";
			cells.push(current.trim());
			return cells;
		}
		/**
		* Convert the structured `content_format: "sheet_range"` payload from
		* `drive read-file` into a Markdown table so the sidebar preview can render
		* spreadsheets (xlsx / ksheet) as a real table instead of raw JSON.
		*/
		function sheetRangeToMarkdown(content) {
			const obj = content;
			const cells = obj?.range_data?.detail?.rangeData;
			if (!Array.isArray(cells) || cells.length === 0) return "(空表格)";
			let maxRow = 0;
			let maxCol = 0;
			const parsed = cells.map((cell) => {
				const row = Number(cell.originRow ?? cell.rowFrom ?? 0) || 0;
				const col = Number(cell.originCol ?? cell.colFrom ?? 0) || 0;
				if (row > maxRow) maxRow = row;
				if (col > maxCol) maxCol = col;
				return {
					row,
					col,
					text: String(cell.cellText ?? "")
				};
			});
			const grid = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(""));
			for (const cell of parsed) grid[cell.row][cell.col] = cell.text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
			const lines = grid.map((row) => `| ${row.join(" | ")} |`);
			const separator = `| ${grid[0].map(() => "---").join(" | ")} |`;
			const sheetName = Array.isArray(obj?.sheets_info?.detail?.sheetsInfo) ? obj.sheets_info?.detail?.sheetsInfo[0]?.sheetName : void 0;
			return `${sheetName ? `> 工作表：${sheetName}\n\n` : ""}${[
				lines[0],
				separator,
				...lines.slice(1)
			].join("\n")}`;
		}
		const HOOK_MARKER = "__dshClouddocSendHooked";
		const refs = /* @__PURE__ */ new Map();
		function tokenOf(item) {
			const base = item.name.replace(/[/\\\s]+/g, "_").replace(/^_+|_+$/g, "") || item.id.slice(-8);
			const token = `@云文档/${base}`;
			const existing = refs.get(token);
			if (existing && existing.file_id !== item.id) return `@云文档/${base}~${item.id.slice(-6)}`;
			return token;
		}
		function rememberRef(item, excerpt) {
			const token = tokenOf(item);
			const prev = refs.get(token);
			const clipped = excerpt?.trim() ?? "";
			refs.set(token, {
				token,
				name: item.name,
				file_id: item.id,
				type: (item.type || "file").toLowerCase(),
				url: item.link_url,
				excerpt: clipped.length === 0 ? prev?.excerpt : clipped.length > 500 ? void 0 : clipped
			});
			return token;
		}
		function expandKdocsMentions(text) {
			if (!text) return text;
			const blocks = [];
			const used = /* @__PURE__ */ new Set();
			for (const [token, ref] of refs) {
				if (!text.includes(token) || used.has(ref.file_id)) continue;
				used.add(ref.file_id);
				blocks.push(formatBlock(ref));
			}
			if (blocks.length === 0) return text;
			if (text.includes("\n[kdocs]")) return text;
			return `${text.trimEnd()}\n\n${blocks.join("\n")}`;
		}
		function formatBlock(ref) {
			const lines = [
				"[kdocs]",
				`name: ${ref.name}`,
				`file_id: ${ref.file_id}`,
				`type: ${ref.type}`
			];
			if (ref.url) lines.push(`url: ${ref.url}`);
			if (ref.excerpt) lines.push(`excerpt: ${ref.excerpt}`);
			return lines.join("\n");
		}
		function appendToDraft(ctx, sessionId, token) {
			try {
				const actx = ctx.sessions?.scope(sessionId);
				if (actx === void 0) return false;
				const conversation = ctx.get?.("conversation");
				installKdocsSendHook(conversation);
				const input = conversation?.input?.for(actx);
				if (!input) return false;
				const draft = input.state.getSnapshot().draft;
				if (draft.includes(token)) return true;
				input.setDraft(draft.trim() === "" ? token : `${draft.trimEnd()} ${token}`);
				return true;
			} catch {
				return false;
			}
		}
		function installKdocsSendHook(conversation) {
			const face = conversation;
			if (!face || typeof face !== "object") return;
			if (face[HOOK_MARKER] === true) return;
			if (typeof face.sendSession === "function") {
				const original = face.sendSession.bind(face);
				face.sendSession = (session, text, imageIds, mode) => original(session, expandKdocsMentions(text), imageIds, mode);
			}
			if (typeof face.send === "function") {
				const originalSend = face.send.bind(face);
				face.send = (text) => originalSend(expandKdocsMentions(text));
			}
			face[HOOK_MARKER] = true;
		}
		//#endregion
		//#region src/client/index.tsx
		const inject = ["betterSidebar"];
		function isFolder(item) {
			const type = (item.type || "").toLowerCase();
			return type === "folder" || type === "dir" || kindOf(item) === "folder";
		}
		function isOtl(item) {
			return kindOf(item) === "otl";
		}
		function FolderTabIcon() {
			return (0, react.createElement)(TypeIcon, {
				kind: "folder",
				size: 16
			});
		}
		function parseDragItem(event) {
			const raw = event.dataTransfer.getData("application/x-clouddoc") || event.dataTransfer.getData("text/plain");
			if (!raw) return null;
			try {
				const parsed = JSON.parse(raw);
				return parsed && typeof parsed.id === "string" ? parsed : null;
			} catch {
				return null;
			}
		}
		function allowMoveDrop(event) {
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = "move";
		}
		async function getJson(path, init) {
			const response = await fetch(path, init);
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
			return body;
		}
		function isTokenExpired(message) {
			return /Token 已失效|token.*expir|unauthorized|未登录|请重新(登录|获取)/i.test(message);
		}
		const CLI_DOCS = "https://www.kdocs.cn/latest";
		const CMD_LOGIN = "kdocs-cli auth login";
		const CMD_VERSION = "kdocs-cli version";
		const SKILL_DIR = "~/.dsh/skills/kdocs";
		const CMD_OFFICIAL_INSTALL = "https://wpsai.wpscdn.cn/skillhub/pro/v2.6.3/kdocs.zip 下载 zip 包并 unzip 解压，帮我安装这个 skill，然后运行 kdocs-cli auth login 完成认证。";
		function CopyBtn(props) {
			const [done, setDone] = (0, react.useState)(false);
			return (0, react.createElement)("button", {
				type: "button",
				style: {
					marginTop: 6,
					marginRight: 6,
					cursor: "pointer"
				},
				onClick: () => {
					navigator.clipboard.writeText(props.text).then(() => {
						setDone(true);
						window.setTimeout(() => setDone(false), 1500);
					});
				}
			}, done ? "已复制" : props.label || "复制命令");
		}
		function formatContent(data) {
			const content = data.content;
			if (typeof content === "string") return content;
			if (content == null) return "";
			return JSON.stringify(content, null, 2);
		}
		function splitOtlMarkdown(source) {
			const text = source.replace(/^\uFEFF/, "");
			const match = /^#\s+(.+)\n?([\s\S]*)$/.exec(text);
			if (match) return {
				title: match[1].trim() || "未命名文档",
				content: (match[2] || "").replace(/^\n/, "")
			};
			return {
				title: "未命名文档",
				content: text
			};
		}
		function ensureSuffix(name, suffix) {
			const ext = suffix.startsWith(".") ? suffix : `.${suffix}`;
			if (!ext || ext === ".") return name;
			return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
		}
		async function readFileWithPoll(item) {
			let taskId = "";
			for (let attempt = 0; attempt < 20; attempt += 1) {
				const payload = {};
				if (item.id) payload.file_id = item.id;
				else if (item.link_url) payload.link_url = item.link_url;
				if (taskId) payload.task_id = taskId;
				const data = await getJson("/clouddoc/read", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
				if ((typeof data.status === "string" ? data.status : "ok") === "pending") {
					taskId = typeof data.task_id === "string" ? data.task_id : taskId;
					await new Promise((resolve) => setTimeout(resolve, 800));
					continue;
				}
				const warnings = Array.isArray(data.warnings) ? data.warnings.filter((entry) => typeof entry === "string").join("\n") : "";
				const format = typeof data.content_format === "string" ? data.content_format : "";
				const sheetRange = format === "sheet_range";
				return {
					content: sheetRange ? sheetRangeToMarkdown(data.content) : formatContent(data),
					markdown: sheetRange || format === "markdown" || typeof data.content === "string" && format !== "kdc",
					warning: warnings || void 0
				};
			}
			throw new Error("读取超时，文档仍在处理中");
		}
		function CloudDocPanel(props) {
			const { ctx, sessionId } = props;
			const [status, setStatus] = (0, react.useState)("loading");
			const [error, setError] = (0, react.useState)("");
			const [rootDriveId, setRootDriveId] = (0, react.useState)("");
			const [root, setRoot] = (0, react.useState)([]);
			const [expanded, setExpanded] = (0, react.useState)({});
			const [preview, setPreview] = (0, react.useState)({ kind: "empty" });
			const [loginHint, setLoginHint] = (0, react.useState)("");
			const [hasSkill, setHasSkill] = (0, react.useState)(true);
			const [targetParent, setTargetParent] = (0, react.useState)("0");
			const [renamingId, setRenamingId] = (0, react.useState)("");
			const [dropHover, setDropHover] = (0, react.useState)("");
			const [pendingMove, setPendingMove] = (0, react.useState)(null);
			const reload = (0, react.useCallback)(async () => {
				setStatus("loading");
				setError("");
				setLoginHint("");
				try {
					const probe = await getJson("/clouddoc/status");
					setHasSkill(Boolean(probe.skill));
					if (!probe.cli) {
						setStatus("no-cli");
						return;
					}
					if (!probe.authenticated) {
						setStatus("need-login");
						return;
					}
					const page = await getJson("/clouddoc/root?page_size=50");
					const items = (page.items || []).map((item) => ({
						...item,
						drive_id: item.drive_id || page.drive_id,
						parent_id: item.parent_id || "0"
					}));
					setRoot(items);
					setRootDriveId(typeof page.drive_id === "string" && page.drive_id ? page.drive_id : items[0]?.drive_id || "");
					setExpanded({});
					setTargetParent("0");
					setStatus("ready");
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					setError(message);
					setStatus(isTokenExpired(message) ? "need-login" : "error");
				}
			}, []);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const patchName = (fileId, name) => {
				const apply = (items) => items.map((item) => item.id === fileId ? {
					...item,
					name
				} : item);
				setRoot((prev) => apply(prev));
				setExpanded((prev) => {
					const next = {};
					for (const [key, value] of Object.entries(prev)) next[key] = Array.isArray(value) ? apply(value) : value;
					return next;
				});
				setPreview((prev) => prev.kind === "text" && prev.item.id === fileId ? {
					...prev,
					item: {
						...prev.item,
						name
					}
				} : prev);
			};
			const toggleFolder = async (item) => {
				const driveId = item.drive_id || rootDriveId;
				const parentId = isFolder(item) ? item.id : "0";
				const key = `${driveId}:${parentId}`;
				setTargetParent(parentId);
				if (expanded[key] && expanded[key] !== "error") {
					setExpanded((prev) => {
						const next = { ...prev };
						delete next[key];
						return next;
					});
					return;
				}
				setExpanded((prev) => ({
					...prev,
					[key]: "loading"
				}));
				try {
					const qs = new URLSearchParams({ parent_id: parentId });
					if (driveId) qs.set("drive_id", driveId);
					const page = await getJson(`/clouddoc/files?${qs.toString()}`);
					setExpanded((prev) => ({
						...prev,
						[key]: (page.items || []).map((child) => ({
							...child,
							drive_id: child.drive_id || driveId,
							parent_id: child.parent_id || parentId
						}))
					}));
				} catch {
					setExpanded((prev) => ({
						...prev,
						[key]: "error"
					}));
				}
			};
			const openFile = async (item) => {
				setPreview({
					kind: "loading",
					name: item.name
				});
				try {
					const result = await readFileWithPoll(item);
					setPreview({
						kind: "text",
						item,
						content: result.content || "(空内容)",
						markdown: result.markdown,
						editable: isOtl(item),
						warning: result.warning
					});
				} catch (err) {
					setPreview({
						kind: "error",
						name: item.name,
						message: err instanceof Error ? err.message : String(err)
					});
				}
			};
			const renameItem = async (item, nextName) => {
				const trimmed = nextName.trim();
				setRenamingId("");
				if (!trimmed || trimmed === item.name) return;
				const dstName = isFolder(item) ? trimmed : ensureSuffix(trimmed, kindOf(item) === "file" ? "" : extFrom(item));
				try {
					await getJson("/clouddoc/rename", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							file_id: item.id,
							drive_id: item.drive_id || rootDriveId,
							dst_name: dstName
						})
					});
					patchName(item.id, dstName);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			};
			const refreshParent = async (parentId) => {
				if (parentId === "0") {
					await reload();
					return;
				}
				const page = await getJson(`/clouddoc/files?${new URLSearchParams({
					parent_id: parentId,
					drive_id: rootDriveId
				}).toString()}`);
				setExpanded((prev) => ({
					...prev,
					[`${rootDriveId}:${parentId}`]: (page.items || []).map((child) => ({
						...child,
						drive_id: child.drive_id || rootDriveId,
						parent_id: child.parent_id || parentId
					}))
				}));
			};
			const removeItem = (fileId) => {
				setRoot((prev) => prev.filter((item) => item.id !== fileId));
				setExpanded((prev) => {
					const next = {};
					for (const [key, value] of Object.entries(prev)) next[key] = Array.isArray(value) ? value.filter((item) => item.id !== fileId) : value;
					return next;
				});
			};
			const moveItem = async (source, dstParentId, dstDriveId) => {
				const destDrive = dstDriveId || source.drive_id || rootDriveId;
				const fromParent = source.parent_id || "0";
				if (!source.id || !destDrive) return;
				if (source.id === dstParentId) {
					setError("不能把文件夹移进自己");
					return;
				}
				if (fromParent === dstParentId && (source.drive_id || rootDriveId) === destDrive) return;
				try {
					await getJson("/clouddoc/move", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							file_id: source.id,
							drive_id: source.drive_id || rootDriveId,
							dst_drive_id: destDrive,
							dst_parent_id: dstParentId,
							type: source.type,
							name: source.name
						})
					}).then((result) => {
						if (result.warning) setError(result.warning);
					});
					removeItem(source.id);
					await refreshParent(dstParentId);
					if (fromParent !== dstParentId && fromParent !== "0") await refreshParent(fromParent);
					if (fromParent === "0" && dstParentId !== "0") setRoot((prev) => prev.filter((item) => item.id !== source.id));
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			};
			const quoteItem = (item) => {
				if (!sessionId) {
					setError("无法写入输入框（需要已打开的对话会话）");
					return;
				}
				if (!appendToDraft(ctx, sessionId, rememberRef(item))) setError("无法写入输入框（需要已打开的对话会话）");
			};
			const quoteSelection = (item, selected) => {
				if (!sessionId) {
					setError("无法写入输入框（需要已打开的对话会话）");
					return;
				}
				if (!appendToDraft(ctx, sessionId, rememberRef(item, selected))) setError("无法写入输入框（需要已打开的对话会话）");
			};
			const requestMove = (source, dstParentId, destLabel, dstDriveId) => {
				setDropHover("");
				if (isFolder(source)) {
					setPendingMove({
						source,
						dstParentId,
						destLabel,
						dstDriveId
					});
					return;
				}
				moveItem(source, dstParentId, dstDriveId);
			};
			const createAtTarget = async (kind) => {
				if (!rootDriveId) {
					setError("缺少 drive_id，请先刷新");
					return;
				}
				const raw = window.prompt(kind === "folder" ? "文件夹名称" : "智能文档名称");
				if (!raw) return;
				const name = raw.trim();
				if (!name) return;
				try {
					await getJson(kind === "folder" ? "/clouddoc/mkdir" : "/clouddoc/create-otl", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							drive_id: rootDriveId,
							parent_id: targetParent,
							name
						})
					});
					await refreshParent(targetParent);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			};
			if (status === "loading") return (0, react.createElement)("div", { style: pad }, "加载金山文档…");
			if (status === "no-cli") return (0, react.createElement)("div", { style: pad }, (0, react.createElement)("strong", null, "未找到 kdocs-cli"), (0, react.createElement)("div", { style: muted }, "侧栏浏览需要本机 CLI。安装步骤与 README「首次安装」一致：本插件不代为执行安装脚本。"), (0, react.createElement)("div", { style: muted }, "1. 登录金山文档，右侧栏打开「金山文档 Skill」，点「复制指令」贴到对话。示例（版本以弹窗为准）："), (0, react.createElement)("div", { style: mono }, CMD_OFFICIAL_INSTALL), (0, react.createElement)(CopyBtn, {
				text: CMD_OFFICIAL_INSTALL,
				label: "复制官方安装指令"
			}), (0, react.createElement)("div", { style: muted }, "要最新版：再打开同一入口取当前 zip 或指令。不要复制 token 到 git 或聊天记录；认证用 kdocs-cli auth login。"), (0, react.createElement)("div", { style: muted }, "2. 装好后自检："), (0, react.createElement)("div", { style: mono }, CMD_VERSION), (0, react.createElement)(CopyBtn, {
				text: CMD_VERSION,
				label: "复制自检命令"
			}), (0, react.createElement)("div", { style: muted }, "3. 仅登录："), (0, react.createElement)("div", { style: mono }, CMD_LOGIN), (0, react.createElement)(CopyBtn, {
				text: CMD_LOGIN,
				label: "复制登录命令"
			}), (0, react.createElement)("div", { style: muted }, "Skill 目录（浏览不依赖此项）："), (0, react.createElement)("div", { style: mono }, SKILL_DIR), (0, react.createElement)(CopyBtn, {
				text: SKILL_DIR,
				label: "复制 Skill 目录"
			}), (0, react.createElement)("div", { style: muted }, "说明页："), (0, react.createElement)("div", { style: mono }, CLI_DOCS), (0, react.createElement)(CopyBtn, {
				text: CLI_DOCS,
				label: "复制文档地址"
			}), (0, react.createElement)("button", {
				type: "button",
				style: btn,
				onClick: () => void reload()
			}, "刷新"));
			const startLogin = async () => {
				try {
					const result = await getJson("/clouddoc/login", { method: "POST" });
					setLoginHint(result.hint || "请在浏览器完成授权后点刷新。");
					setStatus("need-login");
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
					setStatus("error");
				}
			};
			if (status === "need-login") return (0, react.createElement)("div", { style: pad }, (0, react.createElement)("strong", null, error && isTokenExpired(error) ? "登录已失效" : "需要登录金山文档"), (0, react.createElement)("div", { style: muted }, "插件会在本机启动 kdocs-cli auth login，请在弹出的浏览器里完成授权。不要把 Token 发给对话或 Agent。"), error && isTokenExpired(error) ? (0, react.createElement)("div", { style: danger }, error) : null, loginHint ? (0, react.createElement)("div", { style: muted }, loginHint) : null, (0, react.createElement)("div", { style: muted }, "也可在本机终端执行："), (0, react.createElement)("div", { style: mono }, CMD_LOGIN), (0, react.createElement)(CopyBtn, {
				text: CMD_LOGIN,
				label: "复制登录命令"
			}), (0, react.createElement)("button", {
				type: "button",
				style: btn,
				onClick: () => void startLogin()
			}, "重新登录"), (0, react.createElement)("button", {
				type: "button",
				style: btn,
				onClick: () => void reload()
			}, "我已登录，刷新"));
			if (status === "error") return (0, react.createElement)("div", { style: pad }, (0, react.createElement)("div", { style: danger }, error), isTokenExpired(error) ? (0, react.createElement)("button", {
				type: "button",
				style: btn,
				onClick: () => void startLogin()
			}, "重新登录") : null, (0, react.createElement)("button", {
				type: "button",
				style: btn,
				onClick: () => void reload()
			}, "重试"));
			return (0, react.createElement)("div", { style: layout }, (0, react.createElement)("div", { style: treePane }, (0, react.createElement)("div", { style: header }, (0, react.createElement)("strong", null, "金山文档"), (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => void reload()
			}, "刷新")), hasSkill ? null : (0, react.createElement)("div", { style: muted }, "未检测到 kdocs Skill（浏览不受影响）。对话里操作云文档请把官方技能放到 ", (0, react.createElement)("span", { style: mono }, SKILL_DIR), "。", (0, react.createElement)(CopyBtn, {
				text: SKILL_DIR,
				label: "复制 Skill 目录"
			})), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 6,
				flexWrap: "wrap",
				marginBottom: 8
			} }, (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => void createAtTarget("folder")
			}, "新建文件夹"), (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => void createAtTarget("otl")
			}, "新建智能文档")), (0, react.createElement)("div", { style: muted }, "拖文件或文件夹到目标文件夹；拖到「根目录」可移回根。单击文件夹展开，拖左侧图标移动。"), (0, react.createElement)("div", {
				style: dropHover === "root" ? {
					...dropRoot,
					...dropRootActive
				} : dropRoot,
				onDragOver: (event) => {
					allowMoveDrop(event);
					setDropHover("root");
				},
				onDragLeave: (event) => {
					const related = event.relatedTarget;
					if (related instanceof Node && event.currentTarget.contains(related)) return;
					setDropHover((prev) => prev === "root" ? "" : prev);
				},
				onDrop: (event) => {
					event.preventDefault();
					setDropHover("");
					const source = parseDragItem(event);
					if (source) requestMove(source, "0", "根目录", rootDriveId);
				}
			}, dropHover === "root" ? "松开以移到根目录" : "根目录（拖到这里）"), pendingMove ? (0, react.createElement)("div", { style: confirmBox }, (0, react.createElement)("div", { style: { marginBottom: 8 } }, `将文件夹「${pendingMove.source.name}」移到「${pendingMove.destLabel}」？会在目标处重建同名文件夹并移入内容，原位置可能留下空文件夹。`), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8
			} }, (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => {
					const next = pendingMove;
					setPendingMove(null);
					moveItem(next.source, next.dstParentId, next.dstDriveId);
				}
			}, "确认移动"), (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => setPendingMove(null)
			}, "取消"))) : null, error ? (0, react.createElement)("div", { style: danger }, error) : null, root.length === 0 ? (0, react.createElement)("div", { style: muted }, "根目录为空") : root.map((item) => (0, react.createElement)(TreeRow, {
				key: `${item.drive_id}:${item.id}`,
				item: {
					...item,
					drive_id: item.drive_id || rootDriveId,
					parent_id: item.parent_id || "0"
				},
				expanded,
				renamingId,
				dropHover,
				onDropHover: setDropHover,
				onToggle: toggleFolder,
				onOpen: openFile,
				onStartRename: setRenamingId,
				onCommitRename: renameItem,
				onMove: requestMove,
				onQuote: quoteItem,
				canQuote: Boolean(sessionId),
				depth: 0
			}))), (0, react.createElement)(PreviewPane, {
				preview,
				canQuote: Boolean(sessionId),
				onQuoteFile: quoteItem,
				onQuoteSelection: quoteSelection,
				onSave: async (item, markdown) => {
					const parts = splitOtlMarkdown(markdown);
					await getJson("/clouddoc/save-otl", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							file_id: item.id,
							title: parts.title,
							content: parts.content
						})
					});
					setPreview((prev) => prev.kind === "text" ? {
						...prev,
						content: markdown
					} : prev);
				}
			}));
		}
		function extFrom(item) {
			const kind = kindOf(item);
			if (kind === "folder" || kind === "file") {
				const name = item.name || "";
				const dot = name.lastIndexOf(".");
				return dot > 0 ? name.slice(dot) : item.suffix || "";
			}
			return item.suffix || {
				otl: ".otl",
				ksheet: ".ksheet",
				form: ".form",
				word: ".docx",
				ppt: ".pptx",
				sheet: ".xlsx",
				pdf: ".pdf",
				dbt: ".dbt"
			}[kind] || "";
		}
		function PreviewPane(props) {
			const { preview, canQuote, onQuoteFile, onQuoteSelection, onSave } = props;
			const [editing, setEditing] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)("");
			const [popup, setPopup] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (preview.kind === "text") {
					setDraft(preview.content);
					setEditing(false);
					setSaveError("");
					setPopup(null);
				}
			}, [preview]);
			if (preview.kind === "empty") return (0, react.createElement)("div", { style: previewPane }, (0, react.createElement)("div", { style: muted }, "点文件读取正文；智能文档可编辑保存"));
			if (preview.kind === "loading") return (0, react.createElement)("div", { style: previewPane }, `正在读取 ${preview.name}…`);
			if (preview.kind === "error") return (0, react.createElement)("div", { style: previewPane }, (0, react.createElement)("div", { style: {
				fontWeight: 600,
				marginBottom: 8
			} }, preview.name), (0, react.createElement)("div", { style: danger }, preview.message));
			return (0, react.createElement)("div", { style: previewPane }, (0, react.createElement)("style", null, markdownCss), (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginBottom: 8
			} }, (0, react.createElement)(TypeIcon, {
				kind: kindOf(preview.item),
				size: 18
			}), (0, react.createElement)("div", { style: {
				fontWeight: 600,
				flex: 1
			} }, preview.item.name), preview.item.link_url ? (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => window.open(preview.item.link_url, "_blank")
			}, "网页打开") : null, (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				disabled: !canQuote,
				title: canQuote ? "引用到左侧问答" : "需要已打开的对话会话",
				onClick: () => onQuoteFile(preview.item)
			}, "引用到问答"), preview.editable ? (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				onClick: () => setEditing((value) => !value)
			}, editing ? "预览" : "编辑") : null, preview.editable ? (0, react.createElement)("button", {
				type: "button",
				style: {
					...btn,
					marginTop: 0
				},
				disabled: saving,
				onClick: async () => {
					setSaving(true);
					setSaveError("");
					try {
						await onSave(preview.item, draft);
						setEditing(false);
					} catch (err) {
						setSaveError(err instanceof Error ? err.message : String(err));
					} finally {
						setSaving(false);
					}
				}
			}, saving ? "保存中…" : "保存") : null), preview.warning ? (0, react.createElement)("div", { style: muted }, preview.warning) : null, saveError ? (0, react.createElement)("div", { style: danger }, saveError) : null, preview.editable && editing ? (0, react.createElement)("textarea", {
				style: editor,
				value: draft,
				onChange: (event) => setDraft(event.target.value)
			}) : preview.markdown ? (0, react.createElement)("div", {
				className: "clouddoc-md",
				onMouseUp: (event) => {
					const selected = window.getSelection()?.toString() || "";
					if (!selected.trim()) {
						setPopup(null);
						return;
					}
					setPopup({
						text: selected,
						left: event.clientX,
						top: event.clientY
					});
				},
				dangerouslySetInnerHTML: { __html: renderMarkdown(editing ? draft : preview.content) }
			}) : (0, react.createElement)("pre", {
				style: pre,
				onMouseUp: (event) => {
					const selected = window.getSelection()?.toString() || "";
					if (!selected.trim()) {
						setPopup(null);
						return;
					}
					setPopup({
						text: selected,
						left: event.clientX,
						top: event.clientY
					});
				}
			}, preview.content), popup ? (0, react.createElement)("button", {
				type: "button",
				style: {
					...popupBtn,
					left: Math.min(Math.max(popup.left - 48, 8), window.innerWidth - 120),
					top: Math.max(popup.top - 36, 8)
				},
				disabled: !canQuote,
				onMouseDown: (event) => event.preventDefault(),
				onClick: () => {
					onQuoteSelection(preview.item, popup.text);
					setPopup(null);
					window.getSelection()?.removeAllRanges();
				}
			}, "加入问答") : null);
		}
		function TreeRow(props) {
			const { item, expanded, renamingId, dropHover, onDropHover, onToggle, onOpen, onStartRename, onCommitRename, onMove, onQuote, canQuote, depth } = props;
			const folder = isFolder(item);
			const key = `${item.drive_id || ""}:${item.id}`;
			const kids = folder ? expanded[key] : void 0;
			const renaming = renamingId === item.id;
			const hovering = folder && dropHover === item.id;
			const skipClick = (0, react.useRef)(false);
			const bindDrag = !renaming ? {
				draggable: true,
				onDragStart: (event) => {
					event.stopPropagation();
					skipClick.current = true;
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("application/x-clouddoc", JSON.stringify(item));
					event.dataTransfer.setData("text/plain", JSON.stringify(item));
				},
				onDragEnd: () => {
					window.setTimeout(() => {
						skipClick.current = false;
					}, 0);
					onDropHover("");
				}
			} : {};
			return (0, react.createElement)("div", null, hovering ? (0, react.createElement)("div", { style: {
				...dropLine,
				marginLeft: 8 + depth * 12
			} }) : null, (0, react.createElement)("div", {
				...bindDrag,
				style: {
					...rowBtn,
					paddingLeft: 8 + depth * 12,
					display: "flex",
					alignItems: "center",
					gap: 6,
					cursor: "grab",
					background: hovering ? "color-mix(in srgb, currentColor 12%, transparent)" : "transparent"
				},
				title: "单击打开，双击重命名；拖动整行可移动",
				onDragOver: folder ? (event) => {
					allowMoveDrop(event);
					onDropHover(item.id);
				} : void 0,
				onDragLeave: folder ? (event) => {
					const related = event.relatedTarget;
					if (related instanceof Node && event.currentTarget.contains(related)) return;
					onDropHover("");
				} : void 0,
				onDrop: folder ? (event) => {
					event.preventDefault();
					event.stopPropagation();
					onDropHover("");
					const source = parseDragItem(event);
					if (source) onMove(source, item.id, item.name, item.drive_id);
				} : void 0,
				onClick: () => {
					if (skipClick.current || renaming) return;
					if (folder) onToggle(item);
					else onOpen(item);
				},
				onDoubleClick: (event) => {
					event.stopPropagation();
					onStartRename(item.id);
				}
			}, (0, react.createElement)(TypeIcon, {
				kind: kindOf(item),
				size: 16
			}), renaming ? (0, react.createElement)("input", {
				defaultValue: item.name,
				autoFocus: true,
				style: {
					flex: 1,
					fontSize: 13
				},
				onClick: (event) => event.stopPropagation(),
				onBlur: (event) => onCommitRename(item, event.target.value),
				onKeyDown: (event) => {
					if (event.key === "Enter") onCommitRename(item, event.currentTarget.value);
					if (event.key === "Escape") onStartRename("");
				}
			}) : (0, react.createElement)("span", { style: {
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				flex: 1
			} }, hovering ? `放入「${item.name}」` : item.name || item.id), (0, react.createElement)("button", {
				type: "button",
				draggable: false,
				disabled: !canQuote,
				title: canQuote ? "引用到左侧问答" : "需要已打开的对话会话",
				style: quoteChip,
				onMouseDown: (event) => {
					event.stopPropagation();
					event.preventDefault();
				},
				onClick: (event) => {
					event.stopPropagation();
					onQuote(item);
				}
			}, "@")), kids === "loading" ? (0, react.createElement)("div", { style: {
				...muted,
				paddingLeft: 24 + depth * 12
			} }, "加载中…") : null, kids === "error" ? (0, react.createElement)("div", { style: {
				...muted,
				paddingLeft: 24 + depth * 12
			} }, "加载失败") : null, Array.isArray(kids) ? kids.map((child) => (0, react.createElement)(TreeRow, {
				key: `${child.drive_id}:${child.id}`,
				item: {
					...child,
					drive_id: child.drive_id || item.drive_id,
					parent_id: child.parent_id || item.id
				},
				expanded,
				renamingId,
				dropHover,
				onDropHover,
				onToggle,
				onOpen,
				onStartRename,
				onCommitRename,
				onMove,
				onQuote,
				canQuote,
				depth: depth + 1
			})) : null);
		}
		const pad = {
			padding: 12,
			fontSize: 13,
			lineHeight: 1.45
		};
		const btn = {
			marginTop: 8,
			cursor: "pointer"
		};
		const muted = {
			opacity: .65,
			fontSize: 12,
			margin: "6px 0"
		};
		const mono = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			fontSize: 12,
			wordBreak: "break-all"
		};
		const danger = { color: "var(--dsh-danger, #c00)" };
		const layout = {
			display: "flex",
			height: "100%",
			minHeight: 0
		};
		const treePane = {
			width: "42%",
			overflow: "auto",
			borderRight: "1px solid color-mix(in srgb, currentColor 15%, transparent)",
			padding: 8
		};
		const previewPane = {
			flex: 1,
			overflow: "auto",
			padding: 12,
			fontSize: 13,
			position: "relative"
		};
		const header = {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
			marginBottom: 8
		};
		const dropRoot = {
			border: "1px dashed color-mix(in srgb, currentColor 30%, transparent)",
			borderRadius: 6,
			padding: "6px 8px",
			fontSize: 12,
			opacity: .8,
			marginBottom: 8,
			textAlign: "center"
		};
		const dropRootActive = {
			borderColor: "#4A90E2",
			background: "color-mix(in srgb, #4A90E2 18%, transparent)",
			opacity: 1,
			fontWeight: 600
		};
		const dropLine = {
			height: 2,
			background: "#4A90E2",
			borderRadius: 1,
			marginBottom: 2,
			marginRight: 8
		};
		const confirmBox = {
			border: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
			borderRadius: 6,
			padding: 8,
			marginBottom: 8,
			fontSize: 12,
			lineHeight: 1.45
		};
		const markdownCss = `
.clouddoc-md { font-size: 13px; line-height: 1.55; word-break: break-word; }
.clouddoc-md h1, .clouddoc-md h2, .clouddoc-md h3, .clouddoc-md h4 { margin: 1em 0 0.4em; line-height: 1.3; }
.clouddoc-md h1 { font-size: 1.45em; } .clouddoc-md h2 { font-size: 1.25em; } .clouddoc-md h3 { font-size: 1.1em; }
.clouddoc-md p { margin: 0.55em 0; }
.clouddoc-md ul, .clouddoc-md ol { margin: 0.4em 0; padding-left: 1.4em; }
.clouddoc-md code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; background: color-mix(in srgb, currentColor 10%, transparent); padding: 0.1em 0.3em; border-radius: 3px; }
.clouddoc-md pre { overflow: auto; padding: 8px; border-radius: 6px; background: color-mix(in srgb, currentColor 8%, transparent); }
.clouddoc-md pre code { background: none; padding: 0; }
.clouddoc-md table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 12px; }
.clouddoc-md th, .clouddoc-md td { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); padding: 4px 8px; text-align: left; }
.clouddoc-md blockquote { margin: 0.6em 0; padding-left: 10px; border-left: 3px solid color-mix(in srgb, currentColor 30%, transparent); opacity: 0.9; }
.clouddoc-md img { max-width: 100%; }
.clouddoc-md a { color: inherit; text-decoration: underline; }
`;
		const pre = {
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			fontSize: 12,
			margin: 0
		};
		const editor = {
			width: "100%",
			minHeight: 280,
			boxSizing: "border-box",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
			fontSize: 12,
			lineHeight: 1.5
		};
		const quoteChip = {
			flexShrink: 0,
			cursor: "pointer",
			border: 0,
			background: "color-mix(in srgb, currentColor 10%, transparent)",
			color: "inherit",
			borderRadius: 4,
			fontSize: 11,
			padding: "0 6px",
			height: 20
		};
		const popupBtn = {
			position: "fixed",
			zIndex: 20,
			cursor: "pointer",
			fontSize: 12,
			padding: "4px 8px"
		};
		const rowBtn = {
			width: "100%",
			textAlign: "left",
			background: "transparent",
			border: 0,
			color: "inherit",
			cursor: "pointer",
			padding: "4px 8px"
		};
		function apply(ctx) {
			const hookConversation = (conversation) => {
				if (conversation) installKdocsSendHook(conversation);
			};
			hookConversation(ctx.get?.("conversation"));
			if (typeof ctx.inject === "function") try {
				ctx.inject(["conversation"], (sub) => {
					hookConversation(sub.conversation ?? sub.get("conversation"));
				});
			} catch {}
			if (!ctx.betterSidebar) return;
			ctx.effect(() => ctx.betterSidebar.registerTab({
				id: "kdocs-browser",
				title: () => "金山文档",
				icon: (size) => (0, react.createElement)("span", { style: {
					width: size,
					height: size,
					display: "inline-flex"
				} }, (0, react.createElement)(FolderTabIcon)),
				order: 15,
				single: true,
				component: (props) => (0, react.createElement)(CloudDocPanel, {
					ctx: props.ctx ?? ctx,
					sessionId: props.scope?.sessionId || ""
				})
			}));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map