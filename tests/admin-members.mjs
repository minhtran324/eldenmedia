import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAdminMembers } from "../src/lib/admin/members.ts";

function fixture(count, failOnPage) {
  const members = Array.from({ length: count }, (_, i) => ({
    id: `member-${i + 1}`,
    full_name: `Member ${i + 1}`,
    role: i % 10 === 0 ? "operator" : "idol",
    status: i === 55 ? "pending" : "active",
    operator_id: i % 10 === 0 ? null : `member-${Math.floor(i / 10) * 10 + 1}`,
    total_count: count,
  }));
  const calls = [];
  const failure = { code: "42501", message: "ADMIN_REQUIRED", details: "", hint: "" };
  return {
    members, calls, failure,
    client: {
      async rpc(name, args) {
        assert.equal(name, "admin_members");
        assert.equal(args.search_text, "");
        assert.ok(args.page_size >= 1 && args.page_size <= 50, "SQL 005 rejects oversized pages");
        calls.push(args);
        if (args.page_number === failOnPage) return { data: null, error: failure };
        const offset = (args.page_number - 1) * args.page_size;
        return { data: members.slice(offset, offset + args.page_size), error: null };
      },
    },
  };
}

for (const count of [0, 1, 50, 70, 100, 201]) {
  test(`loads all ${count} members within SQL page limits`, async () => {
    const f = fixture(count);
    const result = await loadAdminMembers(f.client);
    assert.equal(result.error, null);
    assert.deepEqual(result.data, f.members);
    assert.equal(new Set(result.data.map(m => m.id)).size, count);
    assert.equal(f.calls.length, Math.max(1, Math.ceil(count / 50)));
    assert.deepEqual(f.calls.map(c => c.page_number), Array.from({ length: f.calls.length }, (_, i) => i + 1));
  });
}

test("pending requests and team members beyond row 50 remain available to HR tabs", async () => {
  const { client } = fixture(70);
  const { data } = await loadAdminMembers(client);
  assert.equal(data.filter(m => m.status === "pending").length, 1);
  assert.equal(data.find(m => m.id === "member-56").operator_id, "member-51");
  assert.equal(data.filter(m => m.role === "operator").length, 7);
});

for (const page of [1, 2]) {
  test(`failure on page ${page} returns no misleading partial totals`, async () => {
    const f = fixture(70, page);
    const result = await loadAdminMembers(f.client);
    assert.equal(result.data, null);
    assert.equal(result.error, f.failure);
    assert.equal(f.calls.length, page);
  });
}

test("stops when a later page is empty after accounts are removed", async () => {
  const f = fixture(50);
  f.members.forEach(m => { m.total_count = 70; });
  const result = await loadAdminMembers(f.client);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 50);
  assert.equal(f.calls.length, 2);
});
