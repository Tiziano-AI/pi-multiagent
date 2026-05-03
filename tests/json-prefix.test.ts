import assert from "node:assert/strict";
import test from "node:test";
import { hasDefinitelyMalformedJsonObjectPrefix } from "../extensions/multiagent/src/json-prefix.ts";

test("json object prefix classifier accepts incomplete split tokens", () => {
	for (const prefix of [
		'{"aborted":f',
		'{"aborted":false',
		'{"ok":tr',
		'{"value":nul',
		'{"number":-',
		'{"number":1e',
		'{"number":1e+',
		'{"number":1.',
		'{"text":"\\u',
		'{"text":"\\u00',
		'{"text":"\\',
		'{"nested":{"key"',
		'{"array":[1,',
	]) assert.equal(hasDefinitelyMalformedJsonObjectPrefix(prefix), false, prefix);
});

test("json object prefix classifier accepts complete object records", () => {
	for (const record of [
		"{}",
		'{"aborted":false}',
		'{"items":[1,{"name":"ok"}]}   ',
	]) assert.equal(hasDefinitelyMalformedJsonObjectPrefix(record), false, record);
});

test("json object prefix classifier rejects definitely malformed object prefixes", () => {
	for (const prefix of [
		'{"type":"x"}x',
		'{"value":+1',
		'{"value":01',
		'{"value":1..',
		'{"value":truX',
		'{"nested":{"key"]',
		'{"a":1 "b":2',
		'{"a":1,}',
		'{"a":[1,]}',
	]) assert.equal(hasDefinitelyMalformedJsonObjectPrefix(prefix), true, prefix);
});
