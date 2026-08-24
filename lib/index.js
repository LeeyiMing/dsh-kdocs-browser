import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
//#region src/index.ts
const name = "dsh-kdocs-browser";
const inject = ["webServer"];
const execFileAsync = promisify(execFile);
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
async function readJson(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	if (chunks.length === 0) return {};
	const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
async function hasKdocsSkill() {
	const candidates = [
		join(homedir(), ".dsh", "skills", "kdocs", "SKILL.md"),
		join(homedir(), ".dsh", "skills", "kdocs", "SKILL.md"),
		join(homedir(), ".cursor", "skills", "kdocs", "SKILL.md")
	];
	for (const path of candidates) try {
		await access(path);
		return true;
	} catch {}
	return false;
}
async function resolveCli() {
	const candidates = [
		process.env.KDOCS_CLI,
		join(homedir(), ".local/bin/kdocs-cli"),
		"/usr/local/bin/kdocs-cli",
		join(homedir(), "bin/kdocs-cli")
	].filter((value) => Boolean(value));
	for (const path of candidates) try {
		await access(path);
		return path;
	} catch {}
	return null;
}
function deepestData(payload) {
	let current = payload;
	for (let i = 0; i < 4; i += 1) {
		if (!current || typeof current !== "object" || Array.isArray(current)) break;
		const record = current;
		const inner = record.data;
		if (!inner || typeof inner !== "object" || Array.isArray(inner)) return record;
		const nested = inner;
		if ("items" in nested || "status" in nested || "content" in nested || "file" in nested) return nested;
		current = nested;
	}
	return current && typeof current === "object" && !Array.isArray(current) ? current : {};
}
function cliError(payload, stderr) {
	const code = payload.code;
	if (typeof code === "number" && code !== 0) {
		const msg = payload.msg ?? payload.message ?? stderr;
		return typeof msg === "string" && msg ? msg : `kdocs-cli code ${code}`;
	}
	return null;
}
async function kdocs(args, timeoutMs = 6e4) {
	const bin = await resolveCli();
	if (!bin) throw new Error("未找到 kdocs-cli，请先安装金山文档 CLI");
	const { stdout, stderr } = await execFileAsync(bin, args, {
		timeout: timeoutMs,
		maxBuffer: 8 * 1024 * 1024,
		env: {
			...process.env,
			PATH: `${join(homedir(), ".local/bin")}:${process.env.PATH || ""}`
		}
	});
	let payload = {};
	try {
		payload = JSON.parse(stdout);
	} catch {
		throw new Error(stderr.trim() || stdout.trim() || "kdocs-cli 返回非 JSON");
	}
	const err = cliError(payload, stderr);
	if (err) throw new Error(err);
	return payload;
}
function asItems(data) {
	const items = data.items;
	if (!Array.isArray(items)) return [];
	return items.map((item) => {
		if (item && typeof item === "object" && !Array.isArray(item) && "file" in item) {
			const file = item.file;
			return file && typeof file === "object" ? file : item;
		}
		return item;
	});
}
function asRecord(item) {
	return item && typeof item === "object" && !Array.isArray(item) ? item : null;
}
function isFolderRecord(item) {
	const type = String(item.type || "").toLowerCase();
	return type === "folder" || type === "dir";
}
function itemId(item) {
	const id = item.id;
	return typeof id === "string" ? id : "";
}
function itemName(item) {
	const name = item.name;
	return typeof name === "string" && name ? name : "未命名文件夹";
}
async function listAllChildren(driveId, parentId) {
	const out = [];
	let pageToken = "";
	for (let page = 0; page < 40; page += 1) {
		const payload = {
			parent_id: parentId,
			page_size: 50,
			drive_id: driveId
		};
		if (pageToken) payload.page_token = pageToken;
		const data = deepestData(await kdocs([
			"drive",
			"list-files",
			JSON.stringify(payload),
			"--compact"
		]));
		for (const item of asItems(data)) {
			const record = asRecord(item);
			if (record) out.push(record);
		}
		const next = typeof data.next_page_token === "string" ? data.next_page_token : "";
		if (!next) break;
		pageToken = next;
	}
	return out;
}
async function moveFiles(driveId, fileIds, dstDriveId, dstParentId) {
	for (let i = 0; i < fileIds.length; i += 20) {
		const chunk = fileIds.slice(i, i + 20);
		if (chunk.length === 0) continue;
		await kdocs([
			"drive",
			"move-file",
			JSON.stringify({
				drive_id: driveId,
				file_ids: chunk,
				dst_drive_id: dstDriveId,
				dst_parent_id: dstParentId
			}),
			"--compact"
		], 12e4);
	}
}
async function recreateAndMoveFolder(source, dstDriveId, dstParentId) {
	const sourceId = itemId(source);
	const driveId = typeof source.drive_id === "string" && source.drive_id ? source.drive_id : dstDriveId;
	if (!sourceId) throw new Error("文件夹缺少 id");
	if (sourceId === dstParentId) throw new Error("不能把文件夹移进自己");
	const newId = itemId(deepestData(await kdocs([
		"drive",
		"create-folder",
		JSON.stringify({
			drive_id: dstDriveId,
			parent_id: dstParentId,
			name: itemName(source),
			on_name_conflict: "rename"
		}),
		"--compact"
	])));
	if (!newId) throw new Error("重建文件夹失败");
	const children = await listAllChildren(driveId, sourceId);
	await moveFiles(driveId, children.filter((item) => !isFolderRecord(item)).map(itemId).filter(Boolean), dstDriveId, newId);
	for (const child of children.filter(isFolderRecord)) await recreateAndMoveFolder(child, dstDriveId, newId);
	return { id: newId };
}
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/clouddoc",
		handler: async (req, res) => {
			try {
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				const pathname = url.pathname.replace(/\/+$/, "") || "/";
				if (req.method === "GET" && pathname === "/clouddoc/status") {
					const skill = await hasKdocsSkill();
					if (!await resolveCli()) {
						writeJson(res, 200, {
							cli: false,
							authenticated: false,
							skill
						});
						return;
					}
					try {
						const payload = await kdocs([
							"auth",
							"status",
							"--compact"
						]);
						writeJson(res, 200, {
							cli: true,
							authenticated: Boolean(payload.authenticated),
							skill
						});
					} catch (error) {
						writeJson(res, 200, {
							cli: true,
							authenticated: false,
							skill,
							error: error instanceof Error ? error.message : String(error)
						});
					}
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/login") {
					const bin = await resolveCli();
					if (!bin) {
						writeJson(res, 400, { error: "未找到 kdocs-cli" });
						return;
					}
					spawn(bin, ["auth", "login"], {
						env: {
							...process.env,
							PATH: `${join(homedir(), ".local/bin")}:${process.env.PATH || ""}`
						},
						detached: true,
						stdio: "ignore"
					}).unref();
					writeJson(res, 200, {
						ok: true,
						hint: "已启动 kdocs-cli auth login，请在弹出的浏览器里完成授权，然后点刷新。"
					});
					return;
				}
				if (req.method === "GET" && pathname === "/clouddoc/root") {
					const pageSize = Number(url.searchParams.get("page_size") || "50");
					const pageToken = url.searchParams.get("page_token") || void 0;
					const payload = {
						page_size: pageSize,
						order: "desc",
						order_by: "mtime"
					};
					if (pageToken) payload.page_token = pageToken;
					const data = deepestData(await kdocs([
						"drive",
						"list-my-files",
						JSON.stringify(payload),
						"--compact"
					]));
					writeJson(res, 200, {
						drive_id: data.drive_id,
						parent_id: data.parent_id ?? "0",
						next_page_token: data.next_page_token ?? "",
						items: asItems(data)
					});
					return;
				}
				if (req.method === "GET" && pathname === "/clouddoc/files") {
					const driveId = url.searchParams.get("drive_id") || "";
					const parentId = url.searchParams.get("parent_id") || "";
					if (!parentId) {
						writeJson(res, 400, { error: "parent_id 必填" });
						return;
					}
					const payload = {
						parent_id: parentId,
						page_size: Number(url.searchParams.get("page_size") || "50")
					};
					if (driveId) payload.drive_id = driveId;
					const pageToken = url.searchParams.get("page_token");
					if (pageToken) payload.page_token = pageToken;
					const data = deepestData(await kdocs([
						"drive",
						"list-files",
						JSON.stringify(payload),
						"--compact"
					]));
					writeJson(res, 200, {
						next_page_token: data.next_page_token ?? "",
						items: asItems(data)
					});
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/move") {
					const body = await readJson(req);
					const fileId = typeof body.file_id === "string" ? body.file_id : "";
					const driveId = typeof body.drive_id === "string" ? body.drive_id : "";
					const dstDriveId = typeof body.dst_drive_id === "string" && body.dst_drive_id ? body.dst_drive_id : driveId;
					const dstParentId = typeof body.dst_parent_id === "string" ? body.dst_parent_id : "";
					const type = typeof body.type === "string" ? body.type : "";
					if (!fileId || !driveId || dstParentId === "") {
						writeJson(res, 400, { error: "file_id、drive_id、dst_parent_id 必填" });
						return;
					}
					if (type === "folder" || type === "dir") {
						writeJson(res, 200, {
							ok: true,
							id: (await recreateAndMoveFolder({
								id: fileId,
								drive_id: driveId,
								name: typeof body.name === "string" ? body.name : "未命名文件夹",
								type: "folder"
							}, dstDriveId, dstParentId)).id,
							warning: "云盘接口不能直接移动文件夹，已在目标处重建同名文件夹并移入内部文件。原位置可能留下空文件夹，可在网页里删除。"
						});
						return;
					}
					writeJson(res, 200, deepestData(await kdocs([
						"drive",
						"move-file",
						JSON.stringify({
							drive_id: driveId,
							file_ids: [fileId],
							dst_drive_id: dstDriveId,
							dst_parent_id: dstParentId
						}),
						"--compact"
					])));
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/rename") {
					const body = await readJson(req);
					const fileId = typeof body.file_id === "string" ? body.file_id : "";
					const dstName = typeof body.dst_name === "string" ? body.dst_name.trim() : "";
					if (!fileId || !dstName) {
						writeJson(res, 400, { error: "file_id 与 dst_name 必填" });
						return;
					}
					const payload = {
						file_id: fileId,
						dst_name: dstName
					};
					if (typeof body.drive_id === "string" && body.drive_id) payload.drive_id = body.drive_id;
					writeJson(res, 200, deepestData(await kdocs([
						"drive",
						"rename-file",
						JSON.stringify(payload),
						"--compact"
					])));
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/mkdir") {
					const body = await readJson(req);
					const driveId = typeof body.drive_id === "string" ? body.drive_id : "";
					const parentId = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : "0";
					const name = typeof body.name === "string" ? body.name.trim() : "";
					if (!driveId || !name) {
						writeJson(res, 400, { error: "drive_id 与 name 必填" });
						return;
					}
					writeJson(res, 200, deepestData(await kdocs([
						"drive",
						"create-folder",
						JSON.stringify({
							drive_id: driveId,
							parent_id: parentId,
							name,
							on_name_conflict: "rename"
						}),
						"--compact"
					])));
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/create-otl") {
					const body = await readJson(req);
					const driveId = typeof body.drive_id === "string" ? body.drive_id : "";
					const parentId = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : "0";
					let name = typeof body.name === "string" ? body.name.trim() : "";
					if (!driveId || !name) {
						writeJson(res, 400, { error: "drive_id 与 name 必填" });
						return;
					}
					if (!name.toLowerCase().endsWith(".otl")) name = `${name}.otl`;
					writeJson(res, 200, deepestData(await kdocs([
						"drive",
						"create-empty-file",
						JSON.stringify({
							drive_id: driveId,
							parent_id: parentId,
							name,
							file_extension: "otl",
							on_name_conflict: "rename"
						}),
						"--compact"
					])));
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/save-otl") {
					const body = await readJson(req);
					const fileId = typeof body.file_id === "string" ? body.file_id : "";
					const content = typeof body.content === "string" ? body.content : "";
					const title = typeof body.title === "string" ? body.title.trim() : "";
					if (!fileId) {
						writeJson(res, 400, { error: "file_id 必填" });
						return;
					}
					const payload = {
						file_id: fileId,
						content,
						format: "markdown",
						mode: "replace"
					};
					if (title) payload.title = title;
					writeJson(res, 200, deepestData(await kdocs([
						"otl",
						"insert-content",
						JSON.stringify(payload),
						"--compact"
					], 12e4)));
					return;
				}
				if (req.method === "POST" && pathname === "/clouddoc/read") {
					const body = await readJson(req);
					const fileId = typeof body.file_id === "string" ? body.file_id : "";
					const linkUrl = typeof body.link_url === "string" ? body.link_url : "";
					const taskId = typeof body.task_id === "string" ? body.task_id : "";
					if (!fileId && !linkUrl) {
						writeJson(res, 400, { error: "file_id 或 link_url 必填" });
						return;
					}
					const payload = {};
					if (fileId) payload.file_id = fileId;
					else payload.url = linkUrl;
					if (taskId) payload.task_id = taskId;
					payload.format = "markdown";
					writeJson(res, 200, deepestData(await kdocs([
						"drive",
						"read-file",
						JSON.stringify(payload),
						"--compact"
					], 12e4)));
					return;
				}
				writeJson(res, 404, { error: `unknown path ${pathname}` });
			} catch (error) {
				writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	}));
}
//#endregion
export { apply, inject, name };
