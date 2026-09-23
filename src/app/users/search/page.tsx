"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { EmptyState, InitialsBadge, ReviewHeader } from "@/components/portal/ReviewUI";
import styles from "@/components/portal/review.module.css";

type ResultRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  screen_name: string | null;
  updated_at?: string | null;
};

export default function UserSearchPage() {
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  // Keep the existing staff rule and the existing API request contract.
  const canSearch = email.trim().length > 3 || last.trim().length >= 2;
  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSearch || loading) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(false);
    setSubmittedQuery(email.trim() || [first.trim(), last.trim()].filter(Boolean).join(" "));
    try {
      const res = await fetch("/api/user-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          first_name: first.trim(),
          last_name: last.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Search failed");
      const nextResults = json.results ?? json.users ?? json.data ?? [];
      if (!Array.isArray(nextResults)) throw new Error("The search response was not a list of members.");
      setResults(nextResults);
      setHasSearched(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }
  function onClear() {
    setEmail("");
    setFirst("");
    setLast("");
    setResults([]);
    setError(null);
    setHasSearched(false);
    setSubmittedQuery("");
  }
  return (
    <div className={styles.page}>
      <ReviewHeader
        title="User Search"
        icon="search"
        description="Find a member by email or real first/last name, then open their profile for details."
      />
      <section className={styles.panel} aria-labelledby="member-search-title">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="member-search-title">Search for a member</h2>
            <p className={styles.fieldHint}>
              Screen name is visible in User 360 but is not searchable.
            </p>
          </div>
        </div>
        <form onSubmit={onSearch} className={styles.searchForm}>
          <div className={styles.searchPaths}>
            <div className={styles.field}>
              <label htmlFor="member-email">Email</label>
              <div className={styles.inputWrap}>
                <PortalIcon name="mail" />
                <Input
                  id="member-email"
                  name="email"
                  className={styles.input}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="name@example.com"
                  aria-describedby="member-email-help"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <p id="member-email-help" className={styles.fieldHint}>Best match when available.</p>
            </div>
            <div className={styles.orDivider} aria-hidden="true">
              <span>or</span>
            </div>
            <div className={styles.nameFields}>
              <div className={styles.field}>
                <label htmlFor="member-first">First name (optional)</label>
                <div className={styles.inputWrap}>
                  <PortalIcon name="person" />
                  <Input
                    id="member-first"
                    name="first_name"
                    className={styles.input}
                    value={first}
                    onChange={(event) => setFirst(event.target.value)}
                    type="text"
                    placeholder="First name"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="member-last">Last name *</label>
                <div className={styles.inputWrap}>
                  <PortalIcon name="person" />
                  <Input
                    id="member-last"
                    name="last_name"
                    className={styles.input}
                    value={last}
                    onChange={(event) => setLast(event.target.value)}
                    type="text"
                    placeholder="Last name"
                    aria-describedby="member-last-help"
                    autoComplete="off"
                  />
                </div>
                <p id="member-last-help" className={styles.fieldHint}>Required if email is not provided.</p>
              </div>
            </div>
          </div>
          <div className={styles.formActions}>
            <Button
              type="submit"
              className={styles.button}
              data-variant="primary"
              disabled={!canSearch || loading}
            >
              <PortalIcon name="search" />
              {loading ? "Searching…" : "Search"}
            </Button>
            <Button
              type="button"
              className={styles.button}
              variant="ghost"
              onClick={onClear}
              disabled={loading}
            >
              Clear
            </Button>
            <span className={styles.privacyNote}><PortalIcon name="lock" />Results limited to protect privacy.</span>
          </div>
          {error && <div className={styles.errorBox} role="alert">
            <PortalIcon name="alert" />
            <span>
              {error}
            </span>
          </div>}
        </form>
      </section>
      <section
        className={styles.panel}
        aria-labelledby="search-results-title"
        aria-busy={loading}
      >
        <div className={styles.resultsHeading}>
          <h2 id="search-results-title">Results</h2>
          <p
            className={styles.resultsSummary}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading ? "Searching…" : error ? "Search did not complete." : hasSearched ? (
              <>{results.length} {results.length === 1 ? "result" : "results"} returned for <strong>
                {submittedQuery}
              </strong></>
            ) : "Ready when you are."}
          </p>
        </div>
        {loading ? (
          <EmptyState title="Finding members" icon="search">Your results will appear here.</EmptyState>
        ) : results.length === 0 ? (
          <EmptyState
            title={error ? "Search unavailable" : hasSearched ? "No matching members returned" : "Start with an email or name"}
          >
            {error
              ? "Check the message above, then try again."
              : hasSearched
                ? "Check the spelling or try another email or last name."
                : "Run a search above. Select a result to open the full User 360 profile."}
          </EmptyState>
        ) : (
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Member search results; scroll horizontally on smaller screens"
          >
            <table className={styles.table} aria-labelledby="search-results-title">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Screen name</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "—";
                  return (
                    <tr key={row.id}>
                      <th scope="row">
                        <div className={styles.userCell}>
                          <InitialsBadge name={name} />
                          <Link
                            href={`/users/${row.id}`}
                            prefetch={false}
                            className={styles.nameLink}
                          >
                            {name}
                            <PortalIcon name="arrowRight" />
                          </Link>
                        </div>
                      </th>
                      <td>
                        {row.email ?? "—"}
                      </td>
                      <td>
                        {row.screen_name ?? "—"}
                      </td>
                      <td>
                        {row.updated_at ? <time className={styles.tableTime} dateTime={row.updated_at}>
                          {new Date(row.updated_at).toLocaleString()}
                        </time> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
