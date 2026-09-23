"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PortalIcon } from "@/components/portal/PortalIcon";
import styles from "./library.module.css";

/* Existing library records and persistence. No coaching or Journal tables. */
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

/** A real label stays visible while staff are writing. */
function LibraryField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  );
}

export default function LibraryPage() {
  const supabase = supabaseBrowser;

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [editorMode, setEditorMode] = useState<"lesson" | "category">("lesson");
  const [saving, setSaving] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [draftCategory, setDraftCategory] = useState<Category | null>(null);

  const updateActiveCategory = (patch: Partial<Category>) => {
    if (isCreatingCategory) {
      setDraftCategory((prev) => (prev ? { ...prev, ...patch } : prev));
      return;
    }
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === selectedCategory ? { ...cat, ...patch } : cat,
      ),
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
        `,
      )
      .order("display_order");
    if (error) {
      console.error("Error loading categories:", error);
      return;
    }

    const mapped = data?.map((cat: any) => ({
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

  const selectedCategoryRecord = categories.find((cat) => cat.id === selectedCategory) ?? null;

  const activeCategoryRecord = isCreatingCategory
    ? draftCategory
    : selectedCategoryRecord;

  const handleNewCategory = () => {
    const nextDisplayOrder = categories.length > 0
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
    if (!activeCategoryRecord)
      return;
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
    }
    else {
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
    const nextSequenceNumber = lessons.length > 0
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
    if (!selectedLesson)
      return;
    const selectedCat = categories.find((cat) => cat.id === selectedLesson.category_id);
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


  // UI helpers below do not change the table names, save payloads or IDs.
  const visibleLessons = selectedCategory && !isCreatingCategory
    ? lessons.filter((lesson) => lesson.category_id === selectedCategory)
    : [];
  const totalLessonCount = categories.reduce(
    (total, category) => total + category.lesson_count,
    0,
  );

  async function saveWithBusyState(save: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    try {
      await save();
    } catch (error) {
      console.error("Library save failed:", error);
      alert("The save could not be completed. Your entries are still on this page.");
    } finally {
      setSaving(false);
    }
  }

  function chooseCategory(categoryId: string) {
    setSelectedCategory(categoryId);
    setSelectedLesson(null);
    setIsCreatingCategory(false);
    setDraftCategory(null);
    setEditorMode("lesson");
  }

  function beginCategory() {
    handleNewCategory();
    setEditorMode("category");
  }

  function beginLesson() {
    handleNewLesson();
    setEditorMode("lesson");
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headingGroup}>
          <span className={styles.headingIcon}>
            <PortalIcon name="book" />
          </span>
          <div>
            <h1>Library Review</h1>
            <p>Organize categories and edit lessons.</p>
          </div>
        </div>
        <div className={styles.librarySummary}>
          <span>{categories.length} categories</span>
          <span>{totalLessonCount} lessons</span>
          <span className={styles.brandNote}>
            <PortalIcon name="heart" />
            Building Better Relationships
          </span>
        </div>
      </header>

      <div className={styles.workspace}>
        {/* Keep category navigation separate from the wide category editor. */}
        <section className={styles.listPanel} aria-labelledby="library-categories">
          <div className={styles.panelHeading} data-tone="indigo">
            <span className={styles.stepNumber} aria-hidden="true">1</span>
            <div>
              <h2 id="library-categories">Categories</h2>
              <p>Choose a collection</p>
            </div>
          </div>
          <div className={styles.listActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={beginCategory}
              disabled={saving}
            >
              <span className={styles.plus} aria-hidden="true">+</span>
              New Category
            </button>
          </div>
          <ul className={styles.categoryList} aria-label="Lesson categories">
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  className={styles.categoryButton}
                  data-active={selectedCategory === category.id && !isCreatingCategory}
                  aria-pressed={selectedCategory === category.id && !isCreatingCategory}
                  onClick={() => chooseCategory(category.id)}
                  disabled={saving}
                >
                  <PortalIcon name="book" />
                  <span className={styles.categoryName}>{category.name}</span>
                  <span
                    className={styles.count}
                    aria-label={`${category.lesson_count} lessons`}
                  >
                    {category.lesson_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.panelFootnote}>
            <PortalIcon name="info" />
            <p>Choose a category to see its lessons. Use Edit Category for its settings.</p>
          </div>
        </section>

        <section className={styles.listPanel} aria-labelledby="library-lessons">
          <div className={styles.panelHeading} data-tone="coral">
            <span className={styles.stepNumber} aria-hidden="true">2</span>
            <div>
              <h2 id="library-lessons">Lessons</h2>
              <p>{selectedCategoryRecord?.name || "Choose a category first"}</p>
            </div>
          </div>
          <div className={styles.listActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={beginLesson}
              disabled={!selectedCategory || isCreatingCategory || saving}
            >
              <span className={styles.plus} aria-hidden="true">+</span>
              New Lesson
            </button>
            {selectedCategoryRecord && !isCreatingCategory && (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => setEditorMode("category")}
                disabled={saving}
                aria-controls="library-editor"
              >
                <PortalIcon name="settings" />
                Edit Category
              </button>
            )}
          </div>
          {visibleLessons.length > 0 ? (
            <ul className={styles.lessonList} aria-label="Lessons in selected category">
              {visibleLessons.map((lesson) => (
                <li key={lesson.id}>
                  <button
                    type="button"
                    className={styles.lessonButton}
                    data-active={selectedLesson?.id === lesson.id && editorMode === "lesson"}
                    aria-pressed={selectedLesson?.id === lesson.id && editorMode === "lesson"}
                    aria-controls="library-editor"
                    onClick={() => {
                      setSelectedLesson(lesson);
                      setEditorMode("lesson");
                    }}
                    disabled={saving}
                  >
                    <span className={styles.lessonTopline}>
                      <span className={styles.lessonOrder}>
                        {lesson.canon_key || lesson.sequence_number || "—"}
                      </span>
                      <span
                        className={styles.status}
                        data-published={lesson.is_published === true}
                      >
                        {lesson.is_published ? "Published" : "Unpublished"}
                      </span>
                    </span>
                    <span className={styles.lessonTitle}>{lesson.title}</span>
                    <span className={styles.lessonOpen}>
                      Open lesson <PortalIcon name="arrowRight" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.smallEmpty}>
              <PortalIcon name="clipboard" />
              <p>
                {selectedCategory && !isCreatingCategory
                  ? "Lessons for this category appear here. Use New Lesson to add one."
                  : "Select a category on the left to see its lessons."}
              </p>
            </div>
          )}
        </section>

        <section
          id="library-editor"
          className={styles.editorPanel}
          aria-label="Library content editor"
          aria-busy={saving}
        >
          {editorMode === "category" && activeCategoryRecord ? (
            <>
              <div className={styles.editorHeading}>
                <div className={styles.editorTitleGroup}>
                  <PortalIcon name="settings" />
                  <div>
                    <p className={styles.eyebrow}>
                      {isCreatingCategory ? "New category" : "Edit category"}
                    </p>
                    <h2>{activeCategoryRecord.name || "Category details"}</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={saving}
                  onClick={() => void saveWithBusyState(handleSaveCategory)}
                >
                  <PortalIcon name="check" />
                  {saving ? "Saving…" : "Save Category"}
                </button>
              </div>
              <fieldset className={styles.editorFields} disabled={saving}>
                <legend className={styles.visuallyHidden}>Category settings</legend>
                <LibraryField label="Category name" htmlFor="category-name">
                  <input
                    id="category-name"
                    className={styles.control}
                    value={activeCategoryRecord.name || ""}
                    onChange={(event) => updateActiveCategory({ name: event.target.value })}
                    placeholder="Category name"
                  />
                </LibraryField>
                <div className={styles.fieldRow}>
                  <LibraryField label="Display order" htmlFor="category-order">
                    <input
                      id="category-order"
                      className={styles.control}
                      type="number"
                      value={activeCategoryRecord.display_order}
                      onChange={(event) => updateActiveCategory({
                        display_order: event.target.value ? Number(event.target.value) : 0,
                      })}
                    />
                  </LibraryField>
                  <LibraryField label="Slug" htmlFor="category-slug">
                    <input
                      id="category-slug"
                      className={styles.control}
                      value={activeCategoryRecord.slug || ""}
                      onChange={(event) => updateActiveCategory({ slug: event.target.value })}
                      placeholder="Category slug"
                    />
                  </LibraryField>
                </div>
                <LibraryField label="Scene image" htmlFor="category-image">
                  <input
                    id="category-image"
                    className={styles.control}
                    value={activeCategoryRecord.scene_image || ""}
                    onChange={(event) => updateActiveCategory({ scene_image: event.target.value })}
                    placeholder="Scene image"
                  />
                </LibraryField>
                <LibraryField label="Theme" htmlFor="category-theme">
                  <input
                    id="category-theme"
                    className={styles.control}
                    value={activeCategoryRecord.theme || ""}
                    onChange={(event) => updateActiveCategory({ theme: event.target.value })}
                    placeholder="Theme"
                  />
                </LibraryField>
                <LibraryField label="Description" htmlFor="category-description">
                  <textarea
                    id="category-description"
                    className={styles.control}
                    rows={6}
                    value={activeCategoryRecord.description}
                    onChange={(event) => updateActiveCategory({ description: event.target.value || "" })}
                    placeholder="Description"
                  />
                </LibraryField>
                <div className={styles.editorFooter}>
                  <p>Changes are saved only when you choose Save Category.</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (isCreatingCategory) {
                        setIsCreatingCategory(false);
                        setDraftCategory(null);
                      }
                      setEditorMode("lesson");
                    }}
                  >
                    {isCreatingCategory ? "Cancel New Category" : "Back to lessons"}
                  </button>
                </div>
              </fieldset>
            </>
          ) : selectedLesson && editorMode === "lesson" ? (
            <>
              <div className={styles.editorHeading}>
                <div className={styles.editorTitleGroup}>
                  <PortalIcon name="clipboard" />
                  <div>
                    <p className={styles.eyebrow}>{selectedLesson.id ? "Edit lesson" : "New lesson"}</p>
                    <h2>{selectedLesson.title || "Untitled lesson"}</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void saveWithBusyState(handleSaveLesson)}
                  disabled={saving}
                >
                  <PortalIcon name="check" />
                  {saving ? "Saving…" : "Save Lesson"}
                </button>
              </div>
              <fieldset className={styles.editorFields} disabled={saving}>
                <legend className={styles.visuallyHidden}>Lesson content and settings</legend>
                <div className={styles.fieldRow}>
                  <LibraryField label="Category" htmlFor="lesson-category">
                    <select
                      id="lesson-category"
                      className={styles.control}
                      value={selectedLesson.category_id}
                      onChange={(event) => setSelectedLesson({
                        ...selectedLesson,
                        category_id: event.target.value,
                      })}
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </LibraryField>
                  <LibraryField label="Access tier" htmlFor="lesson-tier">
                    <select
                      id="lesson-tier"
                      className={styles.control}
                      value={selectedLesson.tier}
                      onChange={(event) => setSelectedLesson({ ...selectedLesson, tier: event.target.value })}
                    >
                      <option value="All">All</option>
                      <option value="Member">Member</option>
                    </select>
                  </LibraryField>
                </div>
                <div className={styles.fieldRowThree}>
                  <LibraryField label="Canon key" htmlFor="lesson-canon">
                    <input
                      id="lesson-canon"
                      className={styles.control}
                      value={selectedLesson.canon_key ?? ""}
                      onChange={(event) => setSelectedLesson({ ...selectedLesson, canon_key: event.target.value })}
                      placeholder="Canon key"
                    />
                  </LibraryField>
                  <LibraryField label="Sequence number" htmlFor="lesson-sequence">
                    <input
                      id="lesson-sequence"
                      className={styles.control}
                      type="number"
                      value={selectedLesson.sequence_number ?? ""}
                      onChange={(event) => setSelectedLesson({
                        ...selectedLesson,
                        sequence_number: event.target.value ? Number(event.target.value) : null,
                      })}
                    />
                  </LibraryField>
                  <LibraryField label="Level" htmlFor="lesson-level">
                    <input
                      id="lesson-level"
                      className={styles.control}
                      value={selectedLesson.level ?? ""}
                      onChange={(event) => setSelectedLesson({ ...selectedLesson, level: event.target.value })}
                      placeholder="Level"
                    />
                  </LibraryField>
                </div>
                <LibraryField label="Lesson title" htmlFor="lesson-title">
                  <input
                    id="lesson-title"
                    className={styles.control}
                    value={selectedLesson.title}
                    onChange={(event) => setSelectedLesson({ ...selectedLesson, title: event.target.value })}
                    placeholder="Lesson title"
                  />
                </LibraryField>
                <LibraryField label="Summary" htmlFor="lesson-summary">
                  <textarea
                    id="lesson-summary"
                    className={styles.control}
                    rows={4}
                    value={selectedLesson.summary ?? ""}
                    onChange={(event) => setSelectedLesson({ ...selectedLesson, summary: event.target.value })}
                    placeholder="Summary"
                  />
                </LibraryField>
                <LibraryField label="Body" htmlFor="lesson-body">
                  <textarea
                    id="lesson-body"
                    className={`${styles.control} ${styles.writingArea}`}
                    rows={18}
                    value={selectedLesson.body ?? ""}
                    onChange={(event) => setSelectedLesson({ ...selectedLesson, body: event.target.value })}
                    placeholder="Lesson body"
                  />
                </LibraryField>
                <div className={styles.subsectionHeading}>
                  <PortalIcon name="chat" />
                  <h3>Prompts and tags</h3>
                </div>
                <LibraryField label="Tags" htmlFor="lesson-tags" hint="Separate tags with commas.">
                  <textarea
                    id="lesson-tags"
                    className={styles.control}
                    rows={3}
                    value={fromArray(selectedLesson.tags)}
                    onChange={(event) => setSelectedLesson({ ...selectedLesson, tags: toArray(event.target.value) })}
                    placeholder="Tags, separated by commas"
                  />
                </LibraryField>
                <LibraryField
                  label="Coach prompts"
                  htmlFor="lesson-coach-prompts"
                  hint="Separate prompts with commas, as in the existing editor."
                >
                  <textarea
                    id="lesson-coach-prompts"
                    className={styles.control}
                    rows={3}
                    value={fromArray(selectedLesson.coach_prompts)}
                    onChange={(event) => setSelectedLesson({ ...selectedLesson, coach_prompts: toArray(event.target.value) })}
                    placeholder="Coach prompts, separated by commas"
                  />
                </LibraryField>
                <LibraryField
                  label="Journal prompts"
                  htmlFor="lesson-journal-prompts"
                  hint="This is the lesson's prompt text, not a member's private journal entries."
                >
                  <textarea
                    id="lesson-journal-prompts"
                    className={styles.control}
                    rows={5}
                    value={selectedLesson.journal_prompts ?? ""}
                    onChange={(event) => setSelectedLesson({ ...selectedLesson, journal_prompts: event.target.value })}
                    placeholder="Journal prompts"
                  />
                </LibraryField>
                <div className={styles.publishSetting}>
                  <label htmlFor="lesson-published">
                    <input
                      id="lesson-published"
                      type="checkbox"
                      checked={selectedLesson.is_published ?? false}
                      onChange={(event) => setSelectedLesson({ ...selectedLesson, is_published: event.target.checked })}
                    />
                    Published
                  </label>
                  <p>This setting is written when you choose Save Lesson.</p>
                </div>
                <div className={styles.editorFooter}>
                  <p>Save before leaving this lesson. This editor does not autosave.</p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void saveWithBusyState(handleSaveLesson)}
                  >
                    <PortalIcon name="check" />
                    {saving ? "Saving…" : "Save Lesson"}
                  </button>
                </div>
              </fieldset>
            </>
          ) : (
            <div className={styles.emptyEditor}>
              <div className={styles.emptyIllustration} aria-hidden="true">
                <span className={styles.bookShadow} />
                <span className={styles.bookTile}><PortalIcon name="book" /></span>
                <span className={styles.littleHeart}><PortalIcon name="heart" /></span>
              </div>
              <p className={styles.eyebrow}>Your editing space</p>
              <h2>Choose a lesson to begin</h2>
              <p>
                Select a category, then a lesson. Its written content,
                settings and prompts will appear here.
              </p>
              <div className={styles.emptySteps}>
                <span><b>1</b> Choose a category</span>
                <span><b>2</b> Open a lesson</span>
                <span><b>3</b> Edit and save</span>
              </div>
              <div className={styles.privacyNote}>
                <PortalIcon name="lock" />
                <p>Teaching content only. Private member journal entries are not loaded here.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
