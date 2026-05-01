"use client";

import { ConnectionProfileView } from "@/components/client-preview/ClientProfileView";
import { Panel } from "@/components/Panel";
import { PageShell } from "@/components/ui/PageShell";
import { supabaseBrowser as supabase } from "@/lib/supabaseBrowser";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ConnectionProfile = Parameters<typeof ConnectionProfileView>[0]["profile"];

export default function MyStoryPreviewPage() {
  const router = useRouter();
  

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = auth?.user?.id;

        if (!userId) {
          setError("You must be logged in to preview your profile.");
          return;
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(
            `
            id,
            screen_name,
            greeting,
            bio,
            about,
            date_of_birth,
            city,
            region,
            hometown,
            gender_identity,
            sexual_orientation,
            pronouns,
            relationship_intent,
            primary_photo_url,
            photos,
            interests,
            compatibility_alignments,
            match_preferences,  
            mira_profile_insight
          `
          )
          .eq("id", userId)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!data) {
          setError("We couldn’t load your profile preview yet.");
          return;
        }

        setProfile(data as ConnectionProfile);
      } catch (e: any) {
        console.error("Error loading My Story preview:", e);
        setError(e?.message ?? "Something went wrong loading your preview.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  return (
    <PageShell
      label="My Story"
      emoji="🪞"
      title="👀 Profile Preview"
      subtitle="This is what others will see in Connections."
      centeredHeader
      wide
    >
      <Panel>
        <div className="max-w-5xl mx-auto space-y-6 pb-6">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full border border-[#D2D7EB] bg-white px-5 py-2 text-sm font-semibold text-[#0F1B33]"
            >
              ← Back to My Story
            </button>
          </div>

          {loading && <p className="text-sm text-[#4A5878]">Loading preview…</p>}
          {error && !loading && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && profile && (
            <ConnectionProfileView profile={profile} mode="preview" />
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
