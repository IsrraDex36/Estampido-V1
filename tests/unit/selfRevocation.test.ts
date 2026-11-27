import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountRepo, ALL_BROWSERS } from "../../src/adapters/http/accounts/repo.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import { makeTempDir } from "../helpers/fixtures.js";

const K = "k".repeat(64);
const A = "a".repeat(64);
const B = "b".repeat(64);
let dir: string;
let clock: { now: number };
let community: CommunityRepo;
let accounts: AccountRepo;
beforeEach(async () => {
  dir = await makeTempDir();
  clock = { now: 1_000_000 };
  community = new CommunityRepo(join(dir, "c"), () => clock.now);
  accounts = new AccountRepo(community, () => clock.now);
});
afterEach(async () => {
  community.close();
  await rm(dir, { recursive: true, force: true });
});

describe("sign-out revocations («tu propio WhatsApp»)", () => {
  it("nothing revoked → any session may sign in", async () => {
    expect(await accounts.isSelfRevoked(K, A, 1)).toBe(false);
  });

  it("revokes sessions sealed up to (and at) that moment, in that browser only", async () => {
    const { user } = await accounts.upsertFromLink(K, "…1");
    await accounts.revokeSelfSessions(user.id, A);
    expect(await accounts.isSelfRevoked(K, A, clock.now - 1)).toBe(true);
    expect(await accounts.isSelfRevoked(K, A, clock.now)).toBe(true);
    expect(await accounts.isSelfRevoked(K, A, clock.now + 1)).toBe(false); // linked again afterwards
    expect(await accounts.isSelfRevoked(K, B, clock.now - 1)).toBe(false); // another browser
    expect(await accounts.isSelfRevoked("z".repeat(64), A, 0)).toBe(false); // another account
  });

  it("signing out again moves the line forward", async () => {
    const { user } = await accounts.upsertFromLink(K, "…1");
    await accounts.revokeSelfSessions(user.id, A);
    const first = clock.now;
    clock.now += 5_000;
    await accounts.revokeSelfSessions(user.id, A);
    expect(await accounts.isSelfRevoked(K, A, first + 1)).toBe(true);
  });

  it("account deletion revokes every browser, and survives the user row being deleted", async () => {
    const { user } = await accounts.upsertFromLink(K, "…1");
    await accounts.revokeSelfSessions(user.id, ALL_BROWSERS);
    await accounts.deleteUser(user.id);
    expect(await accounts.isSelfRevoked(K, A, clock.now - 1)).toBe(true);
    expect(await accounts.isSelfRevoked(K, B, clock.now - 1)).toBe(true);
    expect(await accounts.isSelfRevoked(K, B, clock.now + 1)).toBe(false);
  });

  it("the stricter of «this browser» and «every browser» wins", async () => {
    const { user } = await accounts.upsertFromLink(K, "…1");
    await accounts.revokeSelfSessions(user.id, ALL_BROWSERS);
    const all = clock.now;
    clock.now += 10_000;
    await accounts.revokeSelfSessions(user.id, A);
    expect(await accounts.isSelfRevoked(K, A, all + 5_000)).toBe(true);
    expect(await accounts.isSelfRevoked(K, B, all + 5_000)).toBe(false);
  });

  it("unknown user: no-op (no crash, nothing revoked)", async () => {
    await accounts.revokeSelfSessions("nope", A);
    expect(await accounts.isSelfRevoked(K, A, 0)).toBe(false);
  });

  it("old revocations are purged once no sealed session could be that old", async () => {
    const { user } = await accounts.upsertFromLink(K, "…1");
    await accounts.revokeSelfSessions(user.id, A);
    const at = clock.now;
    clock.now += 201 * 86_400_000;
    await accounts.purgeExpiredSessions();
    expect(await accounts.isSelfRevoked(K, A, at - 1)).toBe(false);
  });
});
