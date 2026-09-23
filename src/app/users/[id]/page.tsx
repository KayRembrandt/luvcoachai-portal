import Link from "next/link";
import type { ReactNode } from "react";
import UserPendingPhotoCards, { type PendingPhoto } from "@/components/photo-review/UserPendingPhotoCards";
import { createSupabaseServiceClient } from "@/lib/supabaseService";
import { signProfilePhotoRows } from "@/lib/photoUrlSigning";
import ProfileImagePreview from "@/components/ProfileImagePreview";
import { PortalIcon, type PortalIconName } from "@/components/portal/PortalIcon";
import { StatusBadge } from "@/components/portal/ReviewUI";
import styles from "@/components/portal/review.module.css";

function fmtDate(value: any) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return String(value);
  }
}

function fmtDateTime(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeKey(k: string) {
  return k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function humanizeItemId(raw: string) {
  const afterColon = raw.includes(":") ? raw.split(":")[1] : raw;
  return afterColon.replace(/_/g, " ");
}

function Pill({ children }: { children: ReactNode; }) {
  return (
    <span className={styles.pill}>
      {children}
    </span>
  );
}

function PillGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.pillGroup}>
      <div className={styles.pillGroupTitle}>
        {title}
      </div>
      <div className={styles.pillList}>
        {children}
      </div>
    </div>
  );
}

function renderItemsAsPills(value: any) {
  // { items: [{ item_id, severity }, ...] } OR [{ item_id, severity }]
  const itemsRaw = Array.isArray(value) ? value : value?.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;
  const items = itemsRaw
    .filter((x: any) => x && typeof x.item_id === "string")
    .map((x: any) => ({
      item_id: x.item_id as string,
      severity: typeof x.severity === "string" ? x.severity : null,
      group: (x.item_id as string).includes(":")
        ? (x.item_id as string).split(":")[0]
        : "items",
    }));
  const groups = new Map<string, { item_id: string; severity: string | null; }[]>();
  for (const it of items) {
    if (!groups.has(it.group)) groups.set(it.group, []);
    groups.get(it.group)!.push({ item_id: it.item_id, severity: it.severity });
  }
  return (
    <div className={styles.pillGroups}>
      {Array.from(groups.entries()).map(([groupName, groupItems]) => (
        <PillGroup key={groupName} title={humanizeKey(groupName)}>
          {groupItems.map((it) => (
            <Pill key={it.item_id}>
              {humanizeItemId(it.item_id)}
              {it.severity ? (
                <span className={styles.pillDetail}>• {it.severity}</span>
              ) : null}
            </Pill>
          ))}
        </PillGroup>
      ))}
    </div>
  );
}

function PhotosCard({ heroUrl, heroPhotoId }: {
  heroUrl: string | null;
  heroPhotoId: string | null;
}) {
  return (
    <div className={styles.portraitCard}>
      <h2>Profile photo</h2>
      <div className={styles.portraitFrame}>
        <ProfileImagePreview
          src={heroUrl}
          photoId={heroPhotoId}
          alt="Profile photo"
          className={styles.portraitImage}
          fallbackClassName={styles.portraitFallback}
          meta={{ surface: "user360_hero" }}
        />
      </div>
    </div>
  );
}

function renderObjectOfArraysAsPills(value: any) {
  // match_preferences often looks like:
  // { answers: { pace: [...], faith: [...] } } OR { pace: [...], faith: [...] }
  const obj =
    value?.answers && typeof value.answers === "object" ? value.answers : value;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const entries = Object.entries(obj).filter(
    ([, v]) => Array.isArray(v) && v.length > 0
  );
  if (entries.length === 0) return null;
  return (
    <div className={styles.pillGroups}>
      {entries.map(([k, arr]) => (
        <PillGroup key={k} title={humanizeKey(k)}>
          {(arr as any[]).map((raw, idx) => (
            <Pill key={`${k}-${idx}-${String(raw)}`}>
              {String(raw).replace(/_/g, " ")}
            </Pill>
          ))}
        </PillGroup>
      ))}
    </div>
  );
}
// If your photos query returns rows like: { url: string | null, ... }

function ValueBlock({ value }: { value: any; }) {
  const empty = value === null || value === undefined || value === "";
  if (empty) return <div className={styles.emptyValue}>—</div>;
  // ✅ match_preferences style
  // ✅ match_preferences style (dial_in.answers)
  const matchPills = renderMatchPreferencesAsPills(value);
  if (matchPills) {
    return (
      <div className={styles.valueBox}>
        {matchPills}
      </div>
    );
  }
  // ✅ match_preferences (dial_in.answers) → grouped chips
  function renderMatchPreferencesAsPills(value: any) {
    if (!value || typeof value !== "object") return null;
    const answers = value?.dial_in?.answers;
    if (!answers || typeof answers !== "object") return null;
    const groups = Object.entries(answers)
      .map(([k, arr]) => [k, Array.isArray(arr) ? arr : []] as const)
      .filter(([, arr]) => arr.length > 0);
    if (groups.length === 0) return null;
    return (
      <div className={styles.pillGroups}>
        {groups.map(([k, arr]) => (
          <div key={k}>
            <div className={styles.pillGroupTitle}>
              {humanizeKey(k)}
            </div>
            <div className={styles.pillList}>
              {arr.map((v: any) => (
                <Pill key={`${k}:${String(v)}`}>
                  {humanizeKey(String(v))}
                </Pill>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  function renderNonNegotiablesAsPills(value: any) {
    const keys = value?.selected_keys;
    if (!Array.isArray(keys) || keys.length === 0) return null;
    return (
      <PillGroup title="Selected keys">
        {keys.map((k: string) => (
          <Pill key={k}>
            {humanizeKey(String(k))}
          </Pill>
        ))}
      </PillGroup>
    );
  }
  // ✅ compatibility_alignments style
  const itemPills = renderItemsAsPills(value);
  if (itemPills) {
    const count = Array.isArray(value) ? value.length : Array.isArray(value?.items) ? value.items.length : 0;
    const huge = count > 18;
    return huge ? (
      <details className={styles.valueBox}>
        <summary className={styles.openLink}>
          View {count} items
        </summary>
        <div className={styles.expandedValue}>
          {itemPills}
        </div>
      </details>
    ) : (
      //empty box -null field in server
      <div className={styles.valueBox}>
        {itemPills}
      </div>
    );
  }
  // ✅ non_negotiables style
  const nn = renderNonNegotiablesAsPills(value);
  if (nn) {
    return <div className={styles.valueBox}>
      {nn}
    </div>;
  }
  // Default objects/arrays as pretty JSON (still padded)
  const isObject = typeof value === "object" && value !== null;
  if (isObject) {
    const text = JSON.stringify(value, null, 2);
    const big = text.length > 900;
    return big ? (
      <details className={styles.valueBox}>
        <summary className={styles.openLink}>
          View details
        </summary>
        <pre className={styles.jsonValue}>
          {text}
        </pre>
      </details>
    ) : (
      <pre className={styles.jsonValue}>
        {text}
      </pre>
    );
  }
  // Strings
  const text = String(value);
  // ✅ If the value looks like an image URL, render a *small thumbnail* + link
  const isImageUrl =
    /^https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)(\?\S*)?$/i.test(text);
  if (isImageUrl) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noreferrer"
        className={styles.openLink}
      >
        Open image
      </a>
    );
  }
  const long = text.length > 400;
  return (
    //relationship status fields 
    <div className={styles.textValue}>
      {text}
    </div>
  );
}

function Row({ label, value }: { label: string; value: any; }) {
  return (
    <div className={styles.dataRow}>
      <div className={styles.fieldLabel}>
        {label.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())}
      </div>
      <div className={styles.fieldValue}>
        {label === "subscription_status" ? <StatusBadge value={value} /> : <ValueBlock value={value} />}
      </div>
    </div>
  );
}
const sectionIcons: Record<string, PortalIconName> = {
  Name: "person",
  Subscription: "card",
  Details: "info",
  "Home location": "location",
  System: "settings",
  "Profile text": "person",
  "My Story": "book",
  "Compatibility alignments": "heart",
  "Match preferences": "people",
  Connections: "people",
  Onboarding: "clipboard",
  "Raw profile row": "database",
};

function Card({ title, children }: { title: string; children: ReactNode; }) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeading}>
        <PortalIcon name={sectionIcons[title] ?? "info"} />
        <h2>
          {title}
        </h2>
      </div>
      <div className={styles.sectionBody}>
        {children}
      </div>
    </section>
  );
}

function TabNav({ userId, active }: { userId: string; active: string; }) {
  const tabs: { key: string; label: string; icon: PortalIconName; }[] = [
    {
      key: "overview",
      label: "Overview",
      icon: "person"
    },
    {
      key: "profile",
      label: "Profile Parts",
      icon: "clipboard"
    },
    {
      key: "story",
      label: "My Story",
      icon: "book"
    },
    {
      key: "photos",
      label: "Photos",
      icon: "photo"
    },
    {
      key: "onboarding",
      label: "Onboarding",
      icon: "check"
    },
    {
      key: "raw",
      label: "Raw",
      icon: "database"
    },
  ];
  return (
    <nav className={styles.tabs} aria-label="Member profile sections">
      {tabs.map((tab) => (
        <a
          key={tab.key}
          href={`/users/${userId}?tab=${tab.key}`}
          className={styles.tab}
          aria-current={tab.key === active ? "page" : undefined}
        >
          <PortalIcon name={tab.icon} />
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

export default async function User360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; }>;
  searchParams?: Promise<{ tab?: string; }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = sp.tab ?? "overview";
  const supabase = createSupabaseServiceClient();
  type ProfileRow = Record<string, any>;
  type UserPhotoRow = {
    id: string;
    user_id: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    is_primary: boolean | null;
    sort_order: number | null;
    review_status: string | null;
    created_at: string | null;
    photo_kind: string | null;
    staff_notes: string | null;
    admin_notes: string | null;
  };
  const { data: probe, error: probeError } = await supabase
    .from("profiles")
    .select("id,email,screen_name")
    .eq("id", id);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (profileError) {
    return <pre>
      {profileError.message}
    </pre>;
  }
  if (!profile) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        No profile returned for this user.
      </div>
    );
  }
  const p = profile as ProfileRow;
  // ✅ 1) Fetch ALL photos for this user (approved + pending + etc.)
  const { data: photoRows, error: photosError } = await supabase
    .from("profile_photos")
    .select("id, user_id, storage_bucket, storage_path, is_primary, sort_order, review_status, created_at, photo_kind, staff_notes, admin_notes")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  const basePhotoRows = (photoRows ?? []) as UserPhotoRow[];
  if (photosError) {
    console.error("USER360 photos query failed:", photosError.message);
  }
  // Build signed URLs using the existing signing helper.
  const signedPhotoRows = await signProfilePhotoRows(supabase, basePhotoRows);
  const signedMap: Record<string, string> = {};
  for (const row of signedPhotoRows) {
    if (row.storage_path && row.displayUrl) signedMap[row.storage_path] = row.displayUrl;
  }
  // ✅ 3) Split rows by review status
  const approvedRows = signedPhotoRows.filter(
    (r) => r.review_status === "approved"
  );
  const pendingRows = signedPhotoRows.filter(
    (r) => r.review_status === "pending"
  );
  const rejectedRows = signedPhotoRows.filter(
    (r) => r.review_status === "rejected"
  );
  // ✅ 4) Optional: stable ordering for approved
  approvedRows.sort((a, b) => {
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    const ao = a.sort_order ?? 999999;
    const bo = b.sort_order ?? 999999;
    if (ao !== bo) return ao - bo;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  const approvedPhotoViews = approvedRows.map((r) => ({
    id: r.id as string,
    url: r.displayUrl ?? null,
    fullUrl: r.fallbackUrl ?? r.imageUrl ?? r.displayUrl ?? null,
    storage_bucket: r.storage_bucket ?? null,
    storage_path: r.storage_path ?? null,
    thumbPath: r.thumbPath ?? null,
    photoUrlError: r.photoUrlError ?? null,
  }));
  // 6) HERO photo for the left sidebar (approved only; prefer identity/selfie)
  const identityApproved = approvedRows.filter(
    (r) =>
      typeof r.storage_path === "string" && r.storage_path.includes("/identity/")
  );
  const heroRow =
    identityApproved.find((r) => r.is_primary) ??
    identityApproved[0] ??
    approvedRows.find((r) => r.is_primary) ??
    approvedRows[0] ??
    null;
  const heroUrl =
    heroRow?.storage_path ? signedMap?.[heroRow.storage_path] ?? null : null;
  const heroPhotoId = heroRow?.id ?? null;
  // ✅ 6) Pending cards include signed_url too (if you use them)
  const pendingCardPhotos = pendingRows
    .map((r): PendingPhoto | null => {
      const bucket = typeof r?.storage_bucket === "string" ? r.storage_bucket : null;
      const path = typeof r?.storage_path === "string" ? r.storage_path : null;
      if (!bucket || !path) return null;
      return {
        id: r.id as string,
        user_id: id,
        storage_bucket: bucket,
        storage_path: path,
        thumbPath: r.thumbPath ?? null,
        signed_url: r.displayUrl ?? null,
        displayUrl: r.displayUrl ?? null,
        imageUrl: r.imageUrl ?? null,
        fallbackUrl: r.fallbackUrl ?? null,
        photoUrlError: r.photoUrlError ?? null,
        review_status: String(r.review_status ?? "pending"),
        photo_kind: r.photo_kind ?? null,
        kind: r.photo_kind ?? null,
      };
    })
    .filter((photo): photo is PendingPhoto => photo !== null);
  const rejectedCardPhotos = rejectedRows
    .map((r): PendingPhoto | null => {
      const bucket = typeof r?.storage_bucket === "string" ? r.storage_bucket : null;
      const path = typeof r?.storage_path === "string" ? r.storage_path : null;
      if (!path) return null;
      return {
        id: r.id as string,
        user_id: id,
        storage_bucket: bucket,
        storage_path: path,
        thumbPath: r.thumbPath ?? null,
        signed_url: r.displayUrl ?? null,
        displayUrl: r.displayUrl ?? null,
        imageUrl: r.imageUrl ?? null,
        fallbackUrl: r.fallbackUrl ?? null,
        photoUrlError: r.photoUrlError ?? null,
        review_status: "rejected",
        staff_notes: r.staff_notes ?? null,
        admin_notes: r.admin_notes ?? null,
      };
    })
    .filter((photo): photo is PendingPhoto => photo !== null);
  const displayName =
    p.preferred_name ??
    p.display_name ??
    p.real_name ??
    p.screen_name ??
    "User";
  return (
    <div className={styles.page}>
      {/* Keep the page heading accessible without restoring the large banner. */}
      <h1 className="sr-only">Member profile: {displayName}</h1>
      <Link href="/users/search" className={styles.backLink}>
        <PortalIcon name="arrowLeft" />
        Back to User Search
      </Link>
      <div className={styles.profileLayout}>
        <aside className={styles.profileSidebar} aria-label="Member summary">
          <section className={styles.panel}>
            <div className={styles.profileIdentity}>
              <PhotosCard heroUrl={heroUrl} heroPhotoId={heroPhotoId} />
              <div>
                <h2>
                  {displayName}
                </h2>
                <p className={styles.idText}>ID {p.id}</p>
              </div>
              <div className={styles.sidebarSection}>
                <h3>Contact</h3>
                <div className={styles.contactItem}>
                  <span className={styles.contactLabel}><PortalIcon name="mail" />Email</span>
                  <span className={styles.contactValue}>
                    {p.email ?? "—"}
                  </span>
                </div>
                <div className={styles.notificationLine}>
                  <span>Email notifications</span>
                  <StatusBadge value={p.notify_message_email ? "On" : "Off"} />
                </div>
                <div className={styles.contactItem}>
                  <span className={styles.contactLabel}><PortalIcon name="phone" />Phone</span>
                  <span className={styles.contactValue}>
                    {p.phone ?? "—"}
                  </span>
                </div>
                <div className={styles.notificationLine}>
                  <span>SMS notifications</span>
                  <StatusBadge value={p.notify_message_sms ? "On" : "Off"} />
                </div>
              </div>
              <div className={styles.sidebarSection}>
                <h3>Membership</h3>
                <dl className={styles.sidebarFacts}>
                  <div>
                    <dt>Tier</dt>
                    <dd>
                      <StatusBadge value={p.membership_tier ?? "—"} />
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <StatusBadge value={p.subscription_status ?? p.subscription_level ?? "—"} />
                    </dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>
                      {fmtDate(p.created_at)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className={styles.sidebarSection}>
                <h3>System</h3>
                <dl className={styles.sidebarFacts}>
                  <div>
                    <dt>Created at</dt>
                    <dd>
                      {fmtDateTime(p.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt>Updated at</dt>
                    <dd>
                      {fmtDateTime(p.updated_at)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </aside>
        <div className={styles.profileMain}>
          <TabNav userId={p.id} active={tab} />
          <div className={styles.profileSections} data-tab={tab}>
            {tab === "overview" && (
              <>
                <Card title="Name">
                  <Row label="screen_name" value={p.screen_name} />
                  <Row label="display_name" value={p.display_name} />
                  <Row
                    label="legal_ first & last_name"
                    value={[p.legal_first_name, p.legal_last_name].filter(Boolean)
                      .join(", ")}
                  />
                </Card>
                <Card title="Subscription">
                  <Row label="membership_tier - Controls Library Filtering" value={p.membership_tier} />
                  <Row label="subscription_level - Reflects Membership Investment" value={p.subscription_level} />
                  <Row label="subscription_status" value={p.subscription_status} />
                  <Row label="Paid Membership Started" value={fmtDateTime(p.membership_started_at)} />
                </Card>
                <Card title="Details">
                  <Row label="age" value={p.age} />
                  <Row label="height" value={p.height} />
                  <Row label="pronouns" value={p.pronouns} />
                  <Row label="gender_identity" value={p.gender_identity} />
                  <Row label="sexual_orientation" value={p.sexual_orientation} />
                </Card>
                <Card title="Home location">
                  <Row
                    label="Address"
                    value={[p.home_city, p.home_state, p.home_postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  />
                  <Row label="home_country" value={p.home_country} />
                  <Row label="home_latitude" value={p.home_latitude} />
                  <Row label="home_longitude" value={p.home_longitude} />
                  <Row label="search_radius_km" value={p.search_radius_km} />
                  <Row label="hometown" value={p.hometown} />
                </Card>
              </>
            )}
            {tab === "profile" && (
              <>
                <Card title="Profile text">
                  <Row label="bio" value={p.bio} />
                  <Row label="about" value={p.about} />
                  <Row label="greeting" value={p.greeting} />
                </Card>
              </>
            )}
            {tab === "story" && (
              <>
                <Card title="My Story">
                  <Row label="relationship_status" value={p.relationship_status} />
                  <Row label="seeking_genders" value={p.seeking_genders} />
                  <Row label="looking_for_age_min" value={p.looking_for_age_min} />
                  <Row label="looking_for_age_max" value={p.looking_for_age_max} />
                </Card>
                <Card title="Compatibility alignments">
                  <Row label="compatibility_alignments" value={p.compatibility_alignments} />
                </Card>
                <Card title="Match preferences">
                  <Row label="match_preferences" value={p.match_preferences} />
                  <Row label="non_negotiables" value={p.non_negotiables} />
                </Card>
                <Card title="Connections">
                  <Row label="is_active_for_connections" value={p.is_active_for_connections} />
                </Card>
              </>
            )}
            {tab === "photos" && (
              <div className={styles.photoSection}>
                <div className={styles.sectionHeading}>
                  <div className="text-base font-semibold text-slate-900">Photos</div>
                  <div className="text-sm text-slate-500">
                    {approvedRows.length + pendingCardPhotos.length
                      ? `${approvedRows.length} approved • ${pendingCardPhotos.length} pending`
                      : "No photos"}
                  </div>
                </div>
                <div className={styles.photoSectionBody}>
                  {/* Approved */}
                  <div>
                    <div className="text-sm font-semibold text-slate-800 mb-3">Approved</div>
                    {approvedPhotoViews.length === 0 ? (
                      <div className="text-sm text-slate-500">No approved photos on file.</div>
                    ) : (
                      <div className={styles.approvedGrid}>
                        {approvedPhotoViews.map((photo, i) => (
                          <a
                            key={`ap-${photo.id}-${i}`}
                            href={photo.fullUrl ?? photo.url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.approvedLink}
                            title="Open full size"
                          >
                            <ProfileImagePreview
                              src={photo.url}
                              fallbackSrc={photo.fullUrl}
                              photoId={photo.id}
                              alt={`Approved photo ${i + 1}`}
                              className={styles.approvedImage}
                              fallbackClassName={styles.approvedFallback}
                              meta={{
                                surface: "user360_approved_grid",
                                photoId: photo.id,
                                storageBucket: photo.storage_bucket,
                                storagePath: photo.storage_path,
                                thumbPath: photo.thumbPath,
                                photoUrlError: photo.photoUrlError,
                              }}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Pending */}
                  <div>
                    <div className="text-sm font-semibold text-slate-800 mb-3">
                      Pending review
                    </div>
                    {pendingCardPhotos.length === 0 ? (
                      <div className="text-sm text-slate-500">No pending photos.</div>
                    ) : (
                      <UserPendingPhotoCards photos={pendingCardPhotos} />
                    )}
                  </div>
                  {/* ✅ Rejected photos */}
                  <div className="mt-6">
                    <div className="mb-2 text-sm font-semibold text-slate-700">
                      Rejected ({rejectedCardPhotos.length})
                    </div>
                    {rejectedCardPhotos.length ? (
                      <UserPendingPhotoCards photos={rejectedCardPhotos} />
                    ) : (
                      <div className="text-sm text-slate-500">No rejected photos.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {tab === "onboarding" && (
              <>
                <Card title="Onboarding">
                  <Row label="onboarding_step" value={p.onboarding_step} />
                  <Row label="onboarding_completed" value={p.onboarding_completed} />
                  <Row label="onboarding_updated_at" value={p.onboarding_updated_at} />
                  <Row label="mira_profile_insight" value={p.mira_profile_insight} />
                  <Row label="time_sentence" value={p.time_sentence} />
                  <Row label="mira_reflection" value={p.mira_reflection} />
                </Card>
              </>
            )}
            {tab === "raw" && (
              <Card title="Raw profile row">
                <Row label="profiles.*" value={p} />
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
