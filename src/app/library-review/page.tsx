"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Panel } from "@/components/Panel";
import PortalButton from "@/components/ui/PortalButton";

type Category = {
  id: string;
  name: string;
  description: string;
  display_order: number;
  scene_image: string;
  slug: string;
  theme: string;
  lesson_count: number;
};

type Lesson = {
  id: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  canon_key: string;
  level: string;
  created_at?: string;
  tier: string;
  journal_prompts: string;
  is_published: boolean;
  coach_prompts: string[];
  category_id: string;
  sequence_number: number | null;
};

const toArray = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const fromArray = (value?: string[] | null) => (value ?? []).join(", ");

export default function LibraryPage() {
  const supabase = supabaseBrowser;

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
const [isCreatingCategory, setIsCreatingCategory] = useState(false);
const [draftCategory, setDraftCategory] = useState<Category | null>(null);


const updateActiveCategory = (patch: Partial<Category>) => {
  if (isCreatingCategory) {
    setDraftCategory((prev) => (prev ? { ...prev, ...patch } : prev));
    return;
  }

  setCategories((prev) =>
    prev.map((cat) =>
      cat.id === selectedCategory ? { ...cat, ...patch } : cat
    )
  );
};

  const refreshCategories = async () => {
    const { data, error } = await supabase
      .from("lesson_categories")
      .select(
        ` id,
          name,
          description,
          display_order,
          scene_image,
          slug,
          theme,
          lessons(id)
        `
      )
      .order("display_order");

    if (error) {
      console.error("Error loading categories:", error);
      return;
    }


    const mapped =
      data?.map((cat: any) => ({
        id: cat.id,
        name: cat.name ?? "",
        description: cat.description ?? "",
        display_order: cat.display_order ?? 0,
        scene_image: cat.scene_image ?? "",
        slug: cat.slug ?? "",
        theme: cat.theme ?? "",
        lesson_count: cat.lessons?.length ?? 0,
      })) ?? [];

    setCategories(mapped);
  };

  const refreshLessons = async (categoryId: string) => {
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("category_id", categoryId)
      .order("canon_key", { ascending: true, nullsFirst: false })
      .order("sequence_number", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Error loading lessons:", error);
      return;
    }

    setLessons((data as Lesson[]) || []);
  };

  useEffect(() => {
    refreshCategories();
  }, []);

useEffect(() => {
  if (!selectedCategory) return;

  refreshLessons(selectedCategory);
}, [selectedCategory]);

const selectedCategoryRecord =
  categories.find((cat) => cat.id === selectedCategory) ?? null;

  const activeCategoryRecord = isCreatingCategory
  ? draftCategory
  : selectedCategoryRecord;

const handleNewCategory = () => {
  const nextDisplayOrder =
    categories.length > 0
      ? Math.max(...categories.map((c) => c.display_order ?? 0)) + 1
      : 1;

  setSelectedCategory(null);
  setSelectedLesson(null);
  setIsCreatingCategory(true);

  setDraftCategory({
    id: "",
    name: "",
    description: "",
    display_order: nextDisplayOrder,
    scene_image: "",
    slug: "",
    theme: "",
    lesson_count: 0,
  });
};

const handleSaveCategory = async () => {
  if (!activeCategoryRecord) return;

  const categoryPayload = {
    name: activeCategoryRecord.name.trim(),
    description: activeCategoryRecord.description ?? "",
    display_order: Number(activeCategoryRecord.display_order ?? 0),
    scene_image: activeCategoryRecord.scene_image ?? "",
    slug: activeCategoryRecord.slug ?? "",
    theme: activeCategoryRecord.theme ?? "",
  };

  let error;

  if (activeCategoryRecord.id) {
    const result = await supabase
      .from("lesson_categories")
      .update(categoryPayload)
      .eq("id", activeCategoryRecord.id);

    error = result.error;
  } else {
    const result = await supabase
      .from("lesson_categories")
      .insert(categoryPayload);

    error = result.error;
  }

  if (error) {
    console.error("Error saving category:", error);
    alert("Error saving category.");
    return;
  }

  await refreshCategories();
  alert("Category saved!");
  setIsCreatingCategory(false);
  setDraftCategory(null);
};

  const handleNewLesson = () => {
    if (!selectedCategory) {
      alert("Select a category first.");
      return;
    }

    const selectedCat = categories.find((cat) => cat.id === selectedCategory);
    const nextSequenceNumber =
      lessons.length > 0
        ? Math.max(...lessons.map((lesson) => lesson.sequence_number ?? 0)) + 1
        : 1;

    setSelectedLesson({
      id: "",
      category: selectedCat?.name ?? "",
      title: "",
      summary: "",
      body: "",
      tags: [],
      canon_key: "",
      level: "NULL",
      tier: "All",
      journal_prompts: "",
      is_published: false,
      coach_prompts: [],
      category_id: selectedCategory,
      sequence_number: nextSequenceNumber,
    });
  };
  

  const handleSaveLesson = async () => {
    if (!selectedLesson) return;

    const selectedCat = categories.find(
      (cat) => cat.id === selectedLesson.category_id
    );

    const payload = {
      category: selectedCat?.name ?? selectedLesson.category ?? "",
      title: selectedLesson.title.trim(),
      summary: selectedLesson.summary ?? "",
      body: selectedLesson.body ?? "",
      tags: selectedLesson.tags ?? [],
      canon_key: selectedLesson.canon_key?.trim() || null,
      level: selectedLesson.level ?? "",
      tier: selectedLesson.tier || "All",
      journal_prompts: selectedLesson.journal_prompts ?? "",
      is_published: selectedLesson.is_published ?? false,
      coach_prompts: selectedLesson.coach_prompts ?? [],
      category_id: selectedLesson.category_id,
      sequence_number: selectedLesson.sequence_number ?? null,
    };

    if (!payload.title.trim()) {
      alert("Lesson title is required.");
      return;
    }

    if (!payload.category_id) {
      alert("Lesson category is required.");
      return;
    }

    if (!selectedLesson.id) {
      const { data, error } = await supabase
        .from("lessons")
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error("Error creating lesson:", error);
        alert("Error creating lesson.");
        return;
      }

      await refreshLessons(payload.category_id);
      await refreshCategories();
      setSelectedLesson(data as Lesson);
      alert("Lesson created!");
      return;
    }

    const { error } = await supabase
      .from("lessons")
      .update(payload)
      .eq("id", selectedLesson.id);

    if (error) {
      console.error("Error saving lesson:", error);
      alert("Error saving lesson.");
      return;
    }

    await refreshLessons(payload.category_id);
    await refreshCategories();
    alert("Saved!");
  };

  return (
    <div className="w-full px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-[1600px]">
        <Panel>
          <div className="mb-4">
            <h1 className="text-xl font-semibold">Library Review</h1>
            <p className="text-sm opacity-70">
              Organize categories and edit lessons.
            </p>
          </div>

          <div className="grid min-h-[70vh] grid-cols-12 gap-4">
            <div className="col-span-12 rounded-xl border p-4 lg:col-span-2">
              <h2 className="mb-2 text-sm font-semibold uppercase opacity-70">
                Categories
              </h2>

              <PortalButton onClick={handleNewCategory}>
                + New Category
              </PortalButton>


              {activeCategoryRecord && (
                <div className="mt-4 space-y-3 border-t pt-4">
{isCreatingCategory && (
  <PortalButton
    onClick={() => {
      setIsCreatingCategory(false);
      setDraftCategory(null);
    }}
  >
    Cancel New Category
  </PortalButton>
)}

<input
  className="w-full rounded-lg border px-3 py-2"
  value={activeCategoryRecord.name || ""}
  onChange={(e) => updateActiveCategory({ name: e.target.value })}
  placeholder="Category name"
/>

                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    type="number"
                    value={activeCategoryRecord.display_order}
                    onChange={(e) =>
                      updateActiveCategory({
                        display_order: e.target.value ? Number(e.target.value) : 0,
                      })
                    }
                    placeholder="Display order"
                  />

<input
  className="w-full rounded-lg border px-3 py-2"
  value={activeCategoryRecord.scene_image || ""}
  onChange={(e) => updateActiveCategory({ scene_image: e.target.value })}
  placeholder="Scene image"
/>

                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    value={activeCategoryRecord.slug || ""}
onChange={(e) => updateActiveCategory({ slug: e.target.value })}
                    placeholder="Slug"
                  />

                  <input
  className="w-full rounded-lg border px-3 py-2"
  value={activeCategoryRecord.theme || ""}
  onChange={(e) => updateActiveCategory({ theme: e.target.value })}
  placeholder="Theme"
/>

                  <textarea
                    className="w-full rounded-lg border px-3 py-2"
                    rows={4}
                    value={activeCategoryRecord.description}
onChange={(e) => updateActiveCategory({ description: e.target.value || ""})}
                    placeholder="Description"
                  />

                  <PortalButton onClick={handleSaveCategory}>
                    Save Category
                  </PortalButton>
                </div>
              )}

              <div className="mt-4 space-y-2">
                {categories.map((cat) => (
                  <PortalButton
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setSelectedLesson(null);
                      setIsCreatingCategory(false);
                      setDraftCategory(null);
                    }}
                    active={selectedCategory === cat.id}
                    className="block w-full rounded-lg border px-3 py-2 text-left hover:opacity-80"
                  >
                    {cat.name} ({cat.lesson_count})
                  </PortalButton>
                ))}
              </div>
            </div>
           

            <div className="col-span-12 rounded-xl border p-4 lg:col-span-3">
              <h2 className="mb-2 text-sm font-semibold uppercase opacity-70">
                Lessons
              </h2>

              <PortalButton onClick={handleNewLesson}>+ New Lesson</PortalButton>

              <div className="mt-4 space-y-2">
                {lessons.map((lesson) => (
                  <PortalButton
                    key={lesson.id}
                    onClick={() => setSelectedLesson(lesson)}
                    active={selectedLesson?.id === lesson.id}
                    className="block w-full text-left"
                  >
                    {lesson.canon_key || lesson.sequence_number || "—"} — {lesson.title}
                  </PortalButton>
                ))}
              </div>
            </div>

            <div className="col-span-12 rounded-xl border p-4 lg:col-span-7">
              {selectedLesson ? (
                <>
                  <h2 className="mb-3 text-sm font-semibold uppercase opacity-70">
                    Edit Lesson
                  </h2>

                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <select
                      className="w-full rounded-lg border px-3 py-2 h-[44px]"
                      value={selectedLesson.category_id}
                      onChange={(e) =>
                        setSelectedLesson({
                          ...selectedLesson,
                          category_id: e.target.value,
                        })
                      }
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="w-full rounded-lg border px-3 py-2 h-[44px]"
                      value={selectedLesson.tier}
                      onChange={(e) =>
                        setSelectedLesson({
                          ...selectedLesson,
                          tier: e.target.value,
                        })
                      }
                    >
                      <option value="All">All</option>
                      <option value="Member">Member</option>
                    </select>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                      className="w-full rounded-lg border px-3 py-2 h-[44px]"
                      value={selectedLesson.canon_key ?? ""}
                      onChange={(e) =>
                        setSelectedLesson({
                          ...selectedLesson,
                          canon_key: e.target.value,
                        })
                      }
                      placeholder="Canon key"
                    />

                    <input
                      className="w-full rounded-lg border px-3 py-2 h-[44px]"
                      type="number"
                      value={selectedLesson.sequence_number ?? ""}
                      onChange={(e) =>
                        setSelectedLesson({
                          ...selectedLesson,
                          sequence_number: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      placeholder="Sequence number"
                    />

                    <input
                      className="w-full rounded-lg border px-3 py-2 h-[44px]"
                      value={selectedLesson.level ?? ""}
                      onChange={(e) =>
                        setSelectedLesson({
                          ...selectedLesson,
                          level: e.target.value,
                        })
                      }
                      placeholder="Level"
                    />
                  </div>

                  <input
                    className="mb-3 w-full rounded-lg border px-3 py-2 h-[44px]"
                    value={selectedLesson.title}
                    onChange={(e) =>
                      setSelectedLesson({
                        ...selectedLesson,
                        title: e.target.value,
                      })
                    }
                    placeholder="Lesson title"
                  />

                  <textarea
                    className="mb-3 w-full rounded-lg border px-3 py-2"
                    rows={4}
                    value={selectedLesson.summary ?? ""}
                    onChange={(e) =>
                      setSelectedLesson({
                        ...selectedLesson,
                        summary: e.target.value,
                      })
                    }
                    placeholder="Summary"
                  />

                  <textarea
                    className="mb-3 w-full rounded-lg border px-3 py-2"
                    rows={22}
                    value={selectedLesson.body ?? ""}
                    onChange={(e) =>
                      setSelectedLesson({
                        ...selectedLesson,
                        body: e.target.value,
                      })
                    }
                    placeholder="Body"
                  />

                  <textarea
                    className="mb-3 w-full rounded-lg border px-3 py-2"
                    rows={3}
                    value={fromArray(selectedLesson.tags)}
                    onChange={(e) =>
                      setSelectedLesson({
                        ...selectedLesson,
                        tags: toArray(e.target.value),
                      })
                    }
                    placeholder="Tags, separated by commas"
                  />

                  <textarea
                    className="mb-3 w-full rounded-lg border px-3 py-2"
                    rows={3}
                    value={fromArray(selectedLesson.coach_prompts)}
                    onChange={(e) =>
                      setSelectedLesson({
                        ...selectedLesson,
                        coach_prompts: toArray(e.target.value),
                      })
                    }
                    placeholder="Coach prompts, separated by commas"
                  />

                  <textarea
                    className="mb-3 w-full rounded-lg border px-3 py-2"
                    rows={4}
                    value={selectedLesson.journal_prompts ?? ""}
                    onChange={(e) =>
                      setSelectedLesson({
                        ...selectedLesson,
                        journal_prompts: e.target.value,
                      })
                    }
                    placeholder="Journal prompts"
                  />

                  <label className="mb-4 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedLesson.is_published ?? false}
                      onChange={(e) =>
                        setSelectedLesson({
                          ...selectedLesson,
                          is_published: e.target.checked,
                        })
                      }
                    />
                    Published
                  </label>

                  <PortalButton onClick={handleSaveLesson}>Save Lesson</PortalButton>
                </>
              ) : (
                <div className="opacity-60">Select a lesson</div>
              )}
            </div>
          </div>
          
        </Panel>
      </div>
    </div>
  );
}
