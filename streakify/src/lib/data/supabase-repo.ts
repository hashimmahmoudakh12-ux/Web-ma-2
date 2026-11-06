/**
 * The real database (Supabase / Postgres).
 *
 * Uses the SERVICE ROLE key, which bypasses Row Level Security — so this file
 * must only ever run on the server ("server-only" import below enforces it).
 * Every query filters by cafe_id so cafés never see each other's data.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseBrand } from "../brand";
import { parseProgram } from "../program";
import { normalizeGame, type StreakState } from "../streak/engine";
import { referralCode } from "./memory-repo";
import {
  type Cafe,
  type CafePatch,
  type NewCafe,
  type RewardRow,
  type SmsLogEntry,
  type VisitRow,
  type CustomerWrite,
  type PushSubscriptionRow,
  type Squad,
  ConflictError,
  type Customer,
  type DemoDataset,
  DuplicatePhoneError,
  type NewCustomer,
  type Repo,
  type Reward,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function toCafe(r: Row): Cafe {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    customDomain: r.custom_domain,
    timezone: r.timezone,
    currency: r.currency,
    isDemo: r.is_demo,
    brand: parseBrand(r.brand),
    program: parseProgram(r.program),
    counterPinHash: r.counter_pin_hash,
    ownerPasswordHash: r.owner_password_hash ?? null,
    ownerEmail: r.owner_email ?? null,
    posProvider: r.pos_provider,
    posConfig: r.pos_config ?? {},
  };
}

function toCustomer(r: Row): Customer {
  return {
    id: r.id,
    cafeId: r.cafe_id,
    phone: r.phone_e164,
    firstName: r.first_name,
    publicToken: r.public_token,
    leaderboardOptIn: r.leaderboard_opt_in,
    smsOptIn: r.sms_opt_in,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    version: r.version,
    referralCode: r.referral_code,
    squadId: r.squad_id ?? null,
    xp: r.xp ?? 0,
    game: normalizeGame(r.game),
    streakVisits: r.streak_visits,
    streakWeeks: r.streak_weeks,
    totalVisits: r.total_visits,
    lastVisitAt: r.last_visit_at,
    lastVisitWeek: r.last_visit_week,
    weekVisits: r.week_visits,
    settledWeek: r.settled_week,
    saverMonth: r.saver_month,
    saversUsedInMonth: r.savers_used_in_month,
    birthdayRewardYear: r.birthday_reward_year,
    birthdayMonth: r.birthday_month,
    birthdayDay: r.birthday_day,
  };
}

function stateColumns(s: StreakState): Row {
  return {
    xp: s.xp,
    game: s.game,
    streak_visits: s.streakVisits,
    streak_weeks: s.streakWeeks,
    total_visits: s.totalVisits,
    last_visit_at: s.lastVisitAt,
    last_visit_week: s.lastVisitWeek,
    week_visits: s.weekVisits,
    settled_week: s.settledWeek,
    saver_month: s.saverMonth,
    savers_used_in_month: s.saversUsedInMonth,
    birthday_reward_year: s.birthdayRewardYear,
  };
}

function toReward(r: Row): Reward {
  return {
    id: r.id,
    cafeId: r.cafe_id,
    customerId: r.customer_id,
    kind: r.kind,
    name: r.name,
    valueCents: r.value_cents,
    costCents: r.cost_cents,
    status: r.status,
    earnedAt: r.earned_at,
    redeemedAt: r.redeemed_at,
  };
}

function toSquad(r: Row): Squad {
  return { id: r.id, cafeId: r.cafe_id, name: r.name, code: r.code, streakWeeks: r.streak_weeks, lastCompleteWeek: r.last_complete_week };
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(`Database error: ${error.message}`);
}

const CUSTOMER_COLUMNS =
  "id, cafe_id, xp, game, referral_code, squad_id, updated_at, phone_e164, first_name, public_token, leaderboard_opt_in, sms_opt_in, created_at, version, streak_visits, streak_weeks, total_visits, last_visit_at, last_visit_week, week_visits, settled_week, saver_month, savers_used_in_month, birthday_reward_year, birthday_month, birthday_day";

export class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async getCafeBySlug(slug: string) {
    const { data, error } = await this.db.from("cafes").select("*").eq("slug", slug).eq("active", true).maybeSingle();
    fail(error);
    return data ? toCafe(data) : null;
  }

  async getCafeByDomain(domain: string) {
    const { data, error } = await this.db.from("cafes").select("*").eq("custom_domain", domain).eq("active", true).maybeSingle();
    fail(error);
    return data ? toCafe(data) : null;
  }

  async listCafes() {
    const { data, error } = await this.db.from("cafes").select("*").eq("active", true).order("name");
    fail(error);
    return (data ?? []).map(toCafe);
  }

  async findCustomerByPhone(cafeId: string, phone: string) {
    const { data, error } = await this.db
      .from("customers").select(CUSTOMER_COLUMNS).eq("cafe_id", cafeId).eq("phone_e164", phone).maybeSingle();
    fail(error);
    return data ? toCustomer(data) : null;
  }

  async getCustomer(cafeId: string, customerId: string) {
    const { data, error } = await this.db
      .from("customers").select(CUSTOMER_COLUMNS).eq("cafe_id", cafeId).eq("id", customerId).maybeSingle();
    fail(error);
    return data ? toCustomer(data) : null;
  }

  async createCustomer(input: NewCustomer) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.insertCustomer(input, referralCode());
      } catch (e) {
        if (e instanceof Error && e.message === "REFERRAL_CODE_TAKEN") continue;
        throw e;
      }
    }
    throw new Error("Could not create a referral code");
  }

  private async insertCustomer(input: NewCustomer, code: string) {
    const game = normalizeGame(null);
    game.referredBy = input.referredBy ?? null;
    const { data, error } = await this.db
      .from("customers")
      .insert({
        referral_code: code,
        game,
        cafe_id: input.cafeId,
        phone_e164: input.phone,
        first_name: input.firstName,
        birthday_month: input.birthdayMonth,
        birthday_day: input.birthdayDay,
        privacy_accepted_at: input.now.toISOString(),
        privacy_version: input.privacyVersion,
        sms_opt_in: input.smsOptIn,
        sms_opt_in_at: input.smsOptIn ? input.now.toISOString() : null,
        sms_consent_text: input.smsOptIn ? input.smsConsentText : null,
        leaderboard_opt_in: input.leaderboardOptIn,
        created_at: input.now.toISOString(),
      })
      .select(CUSTOMER_COLUMNS)
      .single();
    if (error?.code === "23505") {
      if (error.message.includes("referral")) throw new Error("REFERRAL_CODE_TAKEN");
      throw new DuplicatePhoneError(); // same phone already joined
    }
    fail(error);
    return toCustomer(data!);
  }

  async applyUpdate(w: CustomerWrite) {
    const { data, error } = await this.db.rpc("apply_customer_update", {
      p_cafe_id: w.cafeId,
      p_customer_id: w.customerId,
      p_expected_version: w.expectedVersion,
      p_state: w.state,
      p_visit: w.visit,
      p_rewards: w.rewards,
      p_events: w.events,
      p_meta: w.meta,
    });
    if (error?.message.includes("STREAKIFY_CONFLICT")) throw new ConflictError();
    fail(error);
    return { visitId: (data as string | null) ?? null };
  }

  async findCustomerByReferralCode(cafeId: string, code: string) {
    const { data, error } = await this.db.from("customers").select(CUSTOMER_COLUMNS).eq("cafe_id", cafeId).eq("referral_code", code.toUpperCase()).maybeSingle();
    fail(error);
    return data ? toCustomer(data) : null;
  }

  async getCustomerById(customerId: string) {
    if (!/^[0-9a-f-]{36}$/.test(customerId)) return null;
    const { data, error } = await this.db.from("customers").select(CUSTOMER_COLUMNS).eq("id", customerId).maybeSingle();
    fail(error);
    return data ? toCustomer(data) : null;
  }

  async getCafeById(cafeId: string) {
    const { data, error } = await this.db.from("cafes").select("*").eq("id", cafeId).maybeSingle();
    fail(error);
    return data ? toCafe(data) : null;
  }

  // ---- squads
  async createSquad(cafeId: string, name: string, code: string): Promise<Squad> {
    const { data, error } = await this.db.from("squads").insert({ cafe_id: cafeId, name, code }).select("*").single();
    if (error?.code === "23505") throw new Error("Code taken");
    fail(error);
    return toSquad(data!);
  }
  async getSquad(cafeId: string, squadId: string) {
    const { data, error } = await this.db.from("squads").select("*").eq("cafe_id", cafeId).eq("id", squadId).maybeSingle();
    fail(error);
    return data ? toSquad(data) : null;
  }
  async getSquadByCode(cafeId: string, code: string) {
    const { data, error } = await this.db.from("squads").select("*").eq("cafe_id", cafeId).eq("code", code.toUpperCase()).maybeSingle();
    fail(error);
    return data ? toSquad(data) : null;
  }
  async listSquadMembers(cafeId: string, squadId: string) {
    const { data, error } = await this.db.from("customers").select(CUSTOMER_COLUMNS).eq("cafe_id", cafeId).eq("squad_id", squadId);
    fail(error);
    return (data ?? []).map(toCustomer);
  }
  async setCustomerSquad(cafeId: string, customerId: string, squadId: string | null) {
    fail((await this.db.from("customers").update({ squad_id: squadId }).eq("cafe_id", cafeId).eq("id", customerId)).error);
  }
  async completeSquadWeek(squadId: string, week: string) {
    const { data, error } = await this.db.rpc("complete_squad_week", { p_squad_id: squadId, p_week: week });
    fail(error);
    return (data as number | null) ?? null;
  }

  // ---- web push
  async savePushSubscription(cafeId: string, customerId: string, sub: PushSubscriptionRow) {
    fail(
      (await this.db.from("push_subscriptions").upsert({ cafe_id: cafeId, customer_id: customerId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { onConflict: "endpoint" }))
        .error,
    );
  }
  async listPushSubscriptions(cafeId: string, customerId: string) {
    const { data, error } = await this.db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("cafe_id", cafeId).eq("customer_id", customerId);
    fail(error);
    return (data ?? []) as PushSubscriptionRow[];
  }
  async deletePushSubscription(endpoint: string) {
    fail((await this.db.from("push_subscriptions").delete().eq("endpoint", endpoint)).error);
  }

  // ---- Apple Wallet
  async registerWalletDevice(deviceLibraryId: string, passTypeId: string, serial: string, pushToken: string) {
    const existing = await this.db
      .from("wallet_registrations").select("serial")
      .eq("device_library_id", deviceLibraryId).eq("pass_type_id", passTypeId).eq("serial", serial).maybeSingle();
    fail(existing.error);
    fail(
      (
        await this.db
          .from("wallet_registrations")
          .upsert({ device_library_id: deviceLibraryId, pass_type_id: passTypeId, serial, push_token: pushToken }, { onConflict: "device_library_id,pass_type_id,serial" })
      ).error,
    );
    return !existing.data;
  }
  async unregisterWalletDevice(deviceLibraryId: string, passTypeId: string, serial: string) {
    fail((await this.db.from("wallet_registrations").delete().eq("device_library_id", deviceLibraryId).eq("pass_type_id", passTypeId).eq("serial", serial)).error);
  }
  async listWalletSerials(deviceLibraryId: string, passTypeId: string) {
    const { data, error } = await this.db.from("wallet_registrations").select("serial").eq("device_library_id", deviceLibraryId).eq("pass_type_id", passTypeId);
    fail(error);
    return (data ?? []).map((r) => r.serial as string);
  }
  async listWalletPushTokens(serial: string) {
    const { data, error } = await this.db.from("wallet_registrations").select("push_token, pass_type_id").eq("serial", serial);
    fail(error);
    return (data ?? []).map((r) => ({ pushToken: r.push_token as string, passTypeId: r.pass_type_id as string }));
  }

  async listAvailableRewards(cafeId: string, customerId: string) {
    const { data, error } = await this.db
      .from("rewards").select("*")
      .eq("cafe_id", cafeId).eq("customer_id", customerId).eq("status", "available")
      .order("earned_at");
    fail(error);
    return (data ?? []).map(toReward);
  }

  async redeemReward(cafeId: string, customerId: string, rewardId: string, now: Date, localDate: string) {
    // The `.eq("status", "available")` makes this safe against double taps:
    // only one request can flip it from available to redeemed.
    const { data, error } = await this.db
      .from("rewards")
      .update({ status: "redeemed", redeemed_at: now.toISOString(), redeemed_local_date: localDate })
      .eq("id", rewardId).eq("cafe_id", cafeId).eq("customer_id", customerId).eq("status", "available")
      .select("*")
      .maybeSingle();
    fail(error);
    return data ? toReward(data) : null;
  }

  async savings(cafeId: string, customerId: string, localDate: string) {
    const { data, error } = await this.db
      .from("rewards").select("value_cents, redeemed_local_date")
      .eq("cafe_id", cafeId).eq("customer_id", customerId).eq("status", "redeemed");
    fail(error);
    let totalCents = 0;
    let todayCents = 0;
    for (const r of data ?? []) {
      totalCents += r.value_cents;
      if (r.redeemed_local_date === localDate) todayCents += r.value_cents;
    }
    return { totalCents, todayCents };
  }

  async replaceDemoData(cafeId: string, data: DemoDataset) {
    const cafe = await this.db.from("cafes").select("is_demo").eq("id", cafeId).single();
    fail(cafe.error);
    if (!cafe.data?.is_demo) throw new Error("Only demo cafés can be reset");

    // Deleting customers cascades to their visits, rewards and events.
    fail((await this.db.from("customers").delete().eq("cafe_id", cafeId)).error);
    fail((await this.db.from("squads").delete().eq("cafe_id", cafeId)).error);

    const inserted = await this.db
      .from("customers")
      .insert(
        data.customers.map((c) => ({
          cafe_id: cafeId,
          phone_e164: c.phone,
          first_name: c.firstName,
          birthday_month: c.birthdayMonth,
          birthday_day: c.birthdayDay,
          privacy_accepted_at: c.createdAt,
          privacy_version: c.privacyVersion,
          sms_opt_in: c.smsOptIn,
          leaderboard_opt_in: c.leaderboardOptIn,
          created_at: c.createdAt,
          referral_code: referralCode(),
          ...stateColumns(c.state),
        })),
      )
      .select("id, phone_e164");
    fail(inserted.error);
    const idByPhone = new Map(inserted.data!.map((r) => [r.phone_e164 as string, r.id as string]));
    const ids = data.customers.map((c) => idByPhone.get(c.phone)!);

    for (let i = 0; i < data.visits.length; i += 500) {
      const chunk = data.visits.slice(i, i + 500).map((v) => ({
        cafe_id: cafeId,
        customer_id: ids[v.customerIndex],
        created_at: v.createdAt,
        local_date: v.localDate,
        week_start: v.weekStart,
        source: "demo",
        streak_visits_after: v.streakVisitsAfter,
        level_after: v.levelAfter,
        xp: v.xp,
      }));
      fail((await this.db.from("visits").insert(chunk)).error);
    }

    if (data.rewards.length) {
      fail(
        (
          await this.db.from("rewards").insert(
            data.rewards.map((r) => ({
              cafe_id: cafeId,
              customer_id: ids[r.customerIndex],
              kind: r.kind,
              level_key: r.levelKey ?? null,
              name: r.name,
              value_cents: r.valueCents,
              cost_cents: r.costCents,
              status: r.redeemedAt ? "redeemed" : "available",
              earned_at: r.earnedAt,
              earned_local_date: r.earnedLocalDate,
              redeemed_at: r.redeemedAt,
              redeemed_local_date: r.redeemedLocalDate,
            })),
          )
        ).error,
      );
    }
    await this.insertDemoSquads(cafeId, data, ids);
  }

  private async insertDemoSquads(cafeId: string, data: DemoDataset, ids: string[]) {
    for (const q of data.squads ?? []) {
      const { data: row, error } = await this.db
        .from("squads")
        .insert({ cafe_id: cafeId, name: q.name, code: q.code, streak_weeks: q.streakWeeks, last_complete_week: q.lastCompleteWeek })
        .select("id")
        .single();
      fail(error);
      fail((await this.db.from("customers").update({ squad_id: row!.id }).in("id", q.members.map((i) => ids[i]))).error);
    }
  }

  // ---------------------------------------------------------------- phase 2+

  async getCustomerByToken(cafeId: string, token: string) {
    if (!/^[a-f0-9]{32}$/.test(token)) return null;
    const { data, error } = await this.db
      .from("customers").select(CUSTOMER_COLUMNS).eq("cafe_id", cafeId).eq("public_token", token).maybeSingle();
    fail(error);
    return data ? toCustomer(data) : null;
  }

  async updateCustomerPrefs(cafeId: string, customerId: string, prefs: { leaderboardOptIn?: boolean; smsOptIn?: boolean; smsConsentText?: string | null }) {
    const patch: Row = {};
    if (prefs.leaderboardOptIn !== undefined) patch.leaderboard_opt_in = prefs.leaderboardOptIn;
    if (prefs.smsOptIn !== undefined) {
      patch.sms_opt_in = prefs.smsOptIn;
      patch.sms_opt_in_at = prefs.smsOptIn ? new Date().toISOString() : null;
      patch.sms_consent_text = prefs.smsOptIn ? (prefs.smsConsentText ?? null) : null;
    }
    fail((await this.db.from("customers").update(patch).eq("cafe_id", cafeId).eq("id", customerId)).error);
  }

  /** Reads every row, 1000 at a time (Supabase's page size). */
  private async all(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(from, from + 999);
      fail(error);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  }

  async deleteCustomer(cafeId: string, customerId: string) {
    fail((await this.db.from("customers").delete().eq("cafe_id", cafeId).eq("id", customerId)).error);
  }

  async listCustomers(cafeId: string) {
    const rows = await this.all((a, b) =>
      this.db.from("customers").select(CUSTOMER_COLUMNS).eq("cafe_id", cafeId).order("created_at").range(a, b),
    );
    return rows.map(toCustomer);
  }

  async listVisits(cafeId: string, from: string, to: string): Promise<VisitRow[]> {
    const rows = await this.all((a, b) =>
      this.db
        .from("visits").select("id, customer_id, local_date, created_at, verified")
        .eq("cafe_id", cafeId).gte("local_date", from).lte("local_date", to)
        .order("created_at").range(a, b),
    );
    return rows.map((r) => ({ id: r.id, customerId: r.customer_id, localDate: r.local_date, createdAt: r.created_at, verified: r.verified }));
  }

  async listRewardActivity(cafeId: string, from: string, to: string): Promise<RewardRow[]> {
    const rows = await this.all((a, b) =>
      this.db
        .from("rewards")
        .select("id, customer_id, kind, name, value_cents, cost_cents, status, earned_local_date, redeemed_local_date")
        .eq("cafe_id", cafeId)
        .or(`and(earned_local_date.gte.${from},earned_local_date.lte.${to}),and(redeemed_local_date.gte.${from},redeemed_local_date.lte.${to})`)
        .order("id").range(a, b),
    );
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      kind: r.kind,
      name: r.name,
      valueCents: r.value_cents,
      costCents: r.cost_cents,
      status: r.status,
      earnedLocalDate: r.earned_local_date,
      redeemedLocalDate: r.redeemed_local_date,
    }));
  }

  async updateCafe(cafeId: string, patch: CafePatch) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.customDomain !== undefined) row.custom_domain = patch.customDomain;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    if (patch.brand !== undefined) row.brand = patch.brand;
    if (patch.program !== undefined) row.program = patch.program;
    if (patch.counterPinHash !== undefined) row.counter_pin_hash = patch.counterPinHash;
    if (patch.ownerPasswordHash !== undefined) row.owner_password_hash = patch.ownerPasswordHash;
    if (patch.ownerEmail !== undefined) row.owner_email = patch.ownerEmail;
    if (patch.posProvider !== undefined) row.pos_provider = patch.posProvider;
    if (patch.posConfig !== undefined) row.pos_config = patch.posConfig;
    const { data, error } = await this.db.from("cafes").update(row).eq("id", cafeId).select("*").single();
    if (error?.code === "23505") throw new Error("Another café already uses that domain");
    fail(error);
    return toCafe(data!);
  }

  async createCafe(input: NewCafe) {
    const { data, error } = await this.db
      .from("cafes")
      .insert({
        slug: input.slug,
        name: input.name,
        timezone: input.timezone,
        currency: input.currency,
        is_demo: input.isDemo,
        brand: input.brand,
        program: input.program,
        counter_pin_hash: input.counterPinHash,
        owner_password_hash: input.ownerPasswordHash,
        owner_email: input.ownerEmail,
      })
      .select("*")
      .single();
    if (error?.code === "23505") throw new Error("That subdomain is already taken");
    fail(error);
    return toCafe(data!);
  }

  async grantReward(cafeId: string, customerId: string, reward: { kind: Reward["kind"]; name: string; valueCents: number; costCents: number }, now: Date, localDate: string) {
    fail(
      (
        await this.db.from("rewards").insert({
          cafe_id: cafeId,
          customer_id: customerId,
          kind: reward.kind,
          name: reward.name,
          value_cents: reward.valueCents,
          cost_cents: reward.costCents,
          earned_at: now.toISOString(),
          earned_local_date: localDate,
        })
      ).error,
    );
  }

  async claimJob(cafeId: string, job: string, period: string) {
    const { error } = await this.db.from("job_runs").insert({ cafe_id: cafeId, job, period });
    if (error?.code === "23505") return false;
    fail(error);
    return true;
  }

  async claimSms(entry: SmsLogEntry) {
    const { data, error } = await this.db
      .from("sms_log")
      .insert({
        cafe_id: entry.cafeId,
        customer_id: entry.customerId,
        phone_e164: entry.phone,
        dedupe_key: entry.dedupeKey,
        body: entry.body,
        status: entry.status,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return null;
    fail(error);
    return String(data!.id);
  }

  async finishSms(id: string, result: { status: SmsLogEntry["status"]; providerId?: string | null; error?: string | null }) {
    fail(
      (await this.db.from("sms_log").update({ status: result.status, provider_id: result.providerId ?? null, error: result.error ?? null }).eq("id", Number(id)))
        .error,
    );
  }

  async optOutPhoneEverywhere(phone: string) {
    const { data, error } = await this.db
      .from("customers")
      .update({ sms_opt_in: false, sms_opt_in_at: null })
      .eq("phone_e164", phone).eq("sms_opt_in", true)
      .select("id");
    fail(error);
    return data?.length ?? 0;
  }

  async markVisitVerified(cafeId: string, visitId: string, posOrderId: string) {
    fail((await this.db.from("visits").update({ verified: true, pos_order_id: posOrderId }).eq("cafe_id", cafeId).eq("id", visitId)).error);
  }
}
