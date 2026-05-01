"use client";



import Image from "next/image";
import { useMemo, useState } from "react";



type ConnectionProfile = {
  id: string;
  screen_name: string | null;
  greeting: string | null;
  bio: string | null;
  about: string | null;

  date_of_birth: string | null;
  city: string | null;
  region: string | null;
  hometown: string | null;

  gender_identity: string | null;
  sexual_orientation: string | null;
  pronouns: string | null;

  relationship_intent: string | null;

  primary_photo_url: string | null;
  photos: string | string[] | null;

  interests: string[] | null;
  compatibility_alignments: Record<string, any> | null;
  match_preferences: Record<string, any> | null;

  mira_profile_insight: string | null;
  connection_preference: string | null;

looking_for_age_min: number | null;
looking_for_age_max: number | null;

// if this is text[] in Supabase:
seeking_genders: string[] | null;

// If you’re not 100% sure on shape yet, use this safer version:
// seeking_genders: string | string[] | null;

};

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function normalizePhotos(primary: string | null, raw: string | string[] | null): string[] {
  let list: string[] = [];

  if (Array.isArray(raw)) {
    list = raw.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  } else if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed.filter((p): p is string => typeof p === "string" && p.trim() !== "");
      } else {
        list = [raw];
      }
    } catch {
      list = [raw];
    }
  }

  if (list.length === 0 && primary) list = [primary];
  return list;
}

function buildTimeSpentSummary(interests: string[]): string {
  if (!interests || interests.length === 0) {
    return "This section is still taking shape — adding a few interests helps people picture your everyday rhythm.";
  }

  const normalized = interests.map((i) => i.replace(/_/g, " ").toLowerCase());

  const home = normalized.filter((i) =>
    ["baking", "cooking", "gardening", "diy", "craft", "reading", "board games"].some((k) => i.includes(k))
  );

  const social = normalized.filter((i) =>
    ["concert", "festival", "comedy", "dining", "travel", "events"].some((k) => i.includes(k))
  );

  const growth = normalized.filter((i) =>
    ["class", "workshop", "learning", "course"].some((k) => i.includes(k))
  );

  const parts: string[] = [];

  if (home.length > 0) {
    parts.push("quiet, creative moments at home");
  }

  if (growth.length > 0) {
    parts.push("learning and personal growth");
  }

  if (social.length > 0) {
    parts.push("getting out to enjoy shared experiences");
  }

  if (parts.length === 0) {
    return "I enjoy spending my time in ways that feel meaningful and balanced, mixing solo moments with time spent connecting with others.";
  }

  return `I enjoy a mix of ${parts.join(", ")}. My time tends to feel balanced — with space for both reflection and connection.`;
}

function buildLookingFor(
  profile: Pick<
    ConnectionProfile,
    | "match_preferences"
    | "relationship_intent"
    | "connection_preference"
    | "looking_for_age_min"
    | "looking_for_age_max"
    | "seeking_genders"
  >
): string[] {
  const out: string[] = [];

  // 0) Freeform text (if you store it)
  if (profile.connection_preference?.trim()) {
    out.push(profile.connection_preference.trim());
  }

  // 1) Relationship intent (stored as column)
  if (profile.relationship_intent?.trim()) {
    out.push(profile.relationship_intent.trim());
  }

  // 2) Age range prefs (stored as columns)
  if (profile.looking_for_age_min || profile.looking_for_age_max) {
    const min = profile.looking_for_age_min ?? "—";
    const max = profile.looking_for_age_max ?? "—";
    out.push(`Age range: ${min}–${max}`);
  }

  // 3) Seeking genders (stored as array)
  if (Array.isArray(profile.seeking_genders) && profile.seeking_genders.length > 0) {
    out.push(`Seeking: ${profile.seeking_genders.join(", ")}`);
  }

  // 4) Match preferences (jsonb) — support MANY shapes
  const mp = profile.match_preferences as Record<string, any> | null | undefined;
  if (mp && typeof mp === "object") {
    const COPY_MAP: Record<string, string> = {
      emotionally_stable: "Emotional maturity and steady communication",
      emotionally_available: "Emotional availability and presence",
      emotional_connection: "A genuine emotional connection",
      deep_connection: "Depth, trust, and real connection",
      playful: "A sense of humor and lightness",
      long_term: "A meaningful, long-term connection",
      intentional: "Dating with intention and clarity",
      mutual_respect: "Mutual respect and kindness",
      honest_communication: "Open and honest communication",
      shared_values: "Aligned values and outlook",
      financially_stable: "Responsible and self-sufficient",
      physical_attraction: "Mutual attraction and chemistry",
      somewhat_aligned: "A shared foundation with room to grow",
      long_term_playful: "Long-term potential with playfulness",
    };

    const STOP = new Set(["no_preference", "none", "unsure", "open_to_discussion"]);

    // Collect tokens from:
    // - true flags
    // - strings
    // - arrays of strings
    // - nested objects that contain strings/bools
    const tokens: string[] = [];

    const walk = (v: any) => {
      if (v === true) return; // handled via keys in object traversal
      if (typeof v === "string") tokens.push(v.trim());
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        Object.entries(v).forEach(([k, val]) => {
          if (val === true) tokens.push(k);
          else walk(val);
        });
      }
    };

    walk(mp);

    const mapped = tokens
      .filter((t) => t && !STOP.has(t))
      .map((t) => COPY_MAP[t] ?? null)
      .filter(Boolean) as string[];

    out.push(...mapped);
  }

  // Dedup + cap
  return Array.from(new Set(out)).slice(0, 6);
}



export function ConnectionProfileView({
  profile,
}: {
  profile: ConnectionProfile;
  mode: "connection" | "preview";
  onStartChat?: () => void;
  onSendWave?: (type?: "wave") => void;
  onBack?: () => void;
}) {

  const photos = useMemo(
    () => normalizePhotos(profile.primary_photo_url, profile.photos),
    [profile.primary_photo_url, profile.photos]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = photos[activeIndex] ?? null;

  
  const age = calculateAge(profile.date_of_birth);

  const currentLocation =
    profile.city || profile.region ? [profile.city, profile.region].filter(Boolean).join(", ") : null;

  const lookingFor = buildLookingFor(profile);

  return (
    <section className="w-full text-sm leading-relaxed text-[#4A5878]">
      {/* Photo floats right */}
      {activePhoto ? (
        <div className="float-right ml-6 mb-4 w-full max-w-[320px]">
          <div className="aspect-[4/5] overflow-hidden rounded-3xl border border-white/60 shadow-sm bg-white">
            <Image
              src={activePhoto}
              alt={profile.screen_name || "Connection photo"}
              width={512}
              height={640}
              className="h-full w-full object-cover"
            />
          </div>

          {photos.length > 1 && (
            <div className="mt-2 flex items-center justify-center gap-2">
              {photos.map((url, index) => (
                <button
                  key={url + index}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={[
                    "px-3 py-1 text-xs font-medium rounded-full border transition-all",
                    index === activeIndex
                      ? "bg-[#b4c7fa] border-[#FB6AAB] text-white"
                      : "bg-white border-[#b4c7fa] text-[#4A5878]",
                  ].join(" ")}
                >
                  ⚪️
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="float-right ml-6 mb-4 w-full max-w-[320px]">
          <div className="aspect-[4/5] rounded-3xl border border-dashed border-[#C4D0F5] bg-white/40 flex items-center justify-center text-sm text-[#4A5878] text-center px-4">
            No photos yet — once they add some, you’ll see them here.
          </div>
        </div>
      )}

      {/* Greeting */}
      {profile.greeting && <p className="mb-3">{profile.greeting}</p>}

      {/* Quick facts */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
        {profile.screen_name && <span className="font-medium text-[#0F1B33]">{profile.screen_name}</span>}
        {profile.screen_name && (age !== null || profile.gender_identity || profile.sexual_orientation) && <span>· ✨ ·</span>}
        {age !== null && <span>{age}</span>}
        {age !== null && (profile.gender_identity || profile.sexual_orientation) && <span>· ✨ ·</span>}
        {profile.gender_identity && <span>{profile.gender_identity}</span>}
        {profile.gender_identity && profile.sexual_orientation && <span>· ✨ ·</span>}
        {profile.sexual_orientation && <span>{profile.sexual_orientation}</span>}
        {profile.pronouns && <span>{profile.pronouns}</span>}
      </div>

      {/* Location */}
      {(currentLocation || profile.hometown) && (
        <div className="space-y-1 mb-4">
          {currentLocation && (
            <p>
              <span className="font-medium text-[#0F1B33]">Currently in:</span> {currentLocation}
            </p>
          )}
          {profile.hometown && (
            <p>
              <span className="font-medium text-[#0F1B33]">Originally from:</span> {profile.hometown}
            </p>
          )}
        </div>
      )}

      {/* About */}
      <h3 className="text-lg font-semibold text-[#0F1B33] mb-1">About</h3>
      <p className="whitespace-pre-line">
        {profile.about ||
          `${profile.screen_name || "They"} are looking for a connection that feels aligned and grounded. They’ve taken time to clarify what matters to them, so both people can feel respected, safe, and on the same page.`}
      </p>

{/* Coach Mira note */}
<div className="mt-4 rounded-2xl border border-[#D7CCFF] bg-[#F5F3FF] px-4 py-3">
  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A5DD6] mb-1">
    Coach Mira’s compatibility note
  </p>
<p className="text-sm text-[#4A5878]">
  Coach Mira will give you insight into how you may align.
</p>

</div>


      {/* 3 blocks (keeps your existing classes) */}
      <div className="profile-sections mt-6">
        {/* Compatibility Highlights */}
        <div className="profile-card">
          <h3 className="mb-3 text-[22px] font-extrabold tracking-[-0.02em] text-[#0F1B33]">
            Compatibility Highlights
          </h3>

          <ul className="list-disc space-y-1 pl-5 text-sm text-[#4A5878]">
            {profile.compatibility_alignments?.answers ? (
              Object.entries(profile.compatibility_alignments.answers)
                .slice(0, 6)
                .flatMap(([group, values]) =>
                  (Array.isArray(values) ? values : []).map((value) => (
                    <li key={`${group}-${value}`}>
                      <span className="font-semibold">
                        {group.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}:
                      </span>{" "}
                      {String(value).replace(/_/g, " ")}
                    </li>
                  ))
                )
            ) : (
              <li className="italic text-[#8A94B2]">No highlights shared yet.</li>
            )}
          </ul>
        </div>

{/* How I Spend My Time */}
<div className="profile-card">
  <h3 className="mb-3 text-[22px] font-extrabold tracking-[-0.02em] text-[#0F1B33]">
    How I Spend My Time
  </h3>

  {Array.isArray(profile.interests) && profile.interests.length > 0 ? (
    <>
     <p className="mb-3 text-sm text-[#4A5878]">
  {buildTimeSpentSummary(profile.interests ?? [])}
</p>


    </>
  ) : (
    <p className="text-sm italic text-[#8A94B2]">
      This section looks empty right now — adding a few interests helps people picture your everyday life.
    </p>
  )}
</div>


        {/* What I'm Looking For */}
        <div className="profile-card">
          <h3 className="mb-3 text-[22px] font-extrabold tracking-[-0.02em] text-[#0F1B33]">
            What I’m Looking For
          </h3>

          {lookingFor.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[#4A5878]">
              {lookingFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-[#8A94B2]">
              No preferences shared yet.
            </p>
          )}
        </div>
      </div>

      {/* Clear float */}
      <div className="clear-both" />



    </section>
  );
}
