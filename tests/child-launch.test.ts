import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { getPiInvocation, resolvePiCommandFromPath } from "../extensions/multiagent/src/child-launch.ts";

test("resolvePiCommandFromPath ignores empty and relative PATH entries", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-"));
	const bin = join(root, "bin");
	await mkdir(bin);
	const launcher = join(bin, process.platform === "win32" ? "pi.cmd" : "pi");
	await writeFile(launcher, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(launcher, 0o755);
	try {
		assert.equal(resolvePiCommandFromPath(`:relative:${bin}`, process.cwd()), launcher);
		assert.equal(resolvePiCommandFromPath(":relative", process.cwd()), undefined);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("resolvePiCommandFromPath skips launchers inside delegated project root", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-deny-"));
	const projectBin = join(root, "project", "bin");
	const trustedBin = join(root, "trusted");
	await mkdir(projectBin, { recursive: true });
	await mkdir(trustedBin);
	await mkdir(join(root, "project", ".pi"));
	const launcherName = process.platform === "win32" ? "pi.cmd" : "pi";
	const projectLauncher = join(projectBin, launcherName);
	const trustedLauncher = join(trustedBin, launcherName);
	await writeFile(projectLauncher, "#!/bin/sh\nexit 1\n", "utf8");
	await writeFile(trustedLauncher, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(projectLauncher, 0o755);
	await chmod(trustedLauncher, 0o755);
	try {
		assert.equal(resolvePiCommandFromPath(`${projectBin}:${trustedBin}`, join(root, "project")), trustedLauncher);
		assert.equal(resolvePiCommandFromPath(`${projectBin}:${trustedBin}`, join(root, "project", ".")), trustedLauncher);
		assert.equal(resolvePiCommandFromPath(`${projectBin}:${trustedBin}`, `${join(root, "project")}/`), trustedLauncher);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("resolvePiCommandFromPath treats dangling project marker symlinks as denied roots", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-dangling-marker-"));
	const project = join(root, "project");
	const projectBin = join(project, "bin");
	const trustedBin = join(root, "trusted");
	await mkdir(projectBin, { recursive: true });
	await mkdir(trustedBin);
	await symlink(join(root, "missing-git-target"), join(project, ".git"));
	const launcherName = process.platform === "win32" ? "pi.cmd" : "pi";
	const projectLauncher = join(projectBin, launcherName);
	const trustedLauncher = join(trustedBin, launcherName);
	await writeFile(projectLauncher, "#!/bin/sh\nexit 1\n", "utf8");
	await writeFile(trustedLauncher, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(projectLauncher, 0o755);
	await chmod(trustedLauncher, 0o755);
	try {
		assert.equal(resolvePiCommandFromPath(`${projectBin}:${trustedBin}`, join(project, "src")), trustedLauncher);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("resolvePiCommandFromPath skips realpath project launchers", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-realpath-"));
	const project = join(root, "project");
	const projectBin = join(project, "bin");
	const trustedBin = join(root, "trusted");
	const linkedProject = join(root, "linked-project");
	const linkedBin = join(root, "linked-bin");
	await mkdir(projectBin, { recursive: true });
	await mkdir(trustedBin);
	await mkdir(join(project, ".pi"));
	await symlink(project, linkedProject, "dir");
	await symlink(projectBin, linkedBin, "dir");
	const launcherName = process.platform === "win32" ? "pi.cmd" : "pi";
	const projectLauncher = join(projectBin, launcherName);
	const trustedLauncher = join(trustedBin, launcherName);
	await writeFile(projectLauncher, "#!/bin/sh\nexit 1\n", "utf8");
	await writeFile(trustedLauncher, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(projectLauncher, 0o755);
	await chmod(trustedLauncher, 0o755);
	try {
		assert.equal(resolvePiCommandFromPath(`${linkedBin}:${trustedBin}`, linkedProject), trustedLauncher);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("getPiInvocation refuses current script or executable inside delegated project root", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-current-deny-"));
	const project = join(root, "project");
	const trustedBin = join(root, "trusted");
	await mkdir(project, { recursive: true });
	await mkdir(trustedBin);
	await mkdir(join(project, ".pi"));
	const launcherName = process.platform === "win32" ? "pi.cmd" : "pi";
	const trustedLauncher = join(trustedBin, launcherName);
	const projectScript = join(project, "pi-entry.js");
	const projectNative = join(project, "pi-native");
	await writeFile(trustedLauncher, "#!/bin/sh\nexit 0\n", "utf8");
	await writeFile(projectScript, "", "utf8");
	await writeFile(projectNative, "#!/bin/sh\nexit 1\n", "utf8");
	await chmod(trustedLauncher, 0o755);
	await chmod(projectNative, 0o755);
	const originalPath = process.env.PATH;
	const originalScript = process.argv[1];
	const originalExecPath = Object.getOwnPropertyDescriptor(process, "execPath");
	try {
		process.env.PATH = trustedBin;
		process.argv[1] = projectScript;
		const scriptInvocation = getPiInvocation(["--mode", "json"], project);
		assert.equal(scriptInvocation.command, trustedLauncher);
		Object.defineProperty(process, "execPath", { value: projectNative, configurable: true, enumerable: true, writable: true });
		process.argv[1] = "";
		const nativeInvocation = getPiInvocation(["--mode", "json"], project);
		assert.equal(nativeInvocation.command, trustedLauncher);
	} finally {
		if (originalPath === undefined) delete process.env.PATH;
		else process.env.PATH = originalPath;
		process.argv[1] = originalScript;
		if (originalExecPath) Object.defineProperty(process, "execPath", originalExecPath);
		await rm(root, { recursive: true, force: true });
	}
});

test("getPiInvocation resolves relative current script before delegated cwd spawn", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-script-cwd-"));
	const scriptRoot = await mkdtemp(join(tmpdir(), "pi-multiagent-launch-script-entry-"));
	const script = join(scriptRoot, "pi-entry.js");
	const originalScript = process.argv[1];
	await writeFile(script, "", "utf8");
	try {
		process.argv[1] = relative(process.cwd(), script);
		const invocation = getPiInvocation(["--mode", "json"], root);
		assert.equal(invocation.command, process.execPath);
		assert.equal(invocation.args[0], resolve(process.argv[1]));
	} finally {
		process.argv[1] = originalScript;
		await rm(root, { recursive: true, force: true });
		await rm(scriptRoot, { recursive: true, force: true });
	}
});
