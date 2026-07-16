"use client";

import { Command } from "cmdk";
import type { GlobalSearchResult } from "@backsteros/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAppApi } from "@/lib/api-context";
import { navigation } from "@/lib/navigation";

import { Icon } from "./ui/icon";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const { client } = useAppApi();

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      client
        .requestJson<{ results: GlobalSearchResult[] }>(
          `/api/v1/global-search?q=${encodeURIComponent(query.trim())}&limit=20`,
          { signal: controller.signal },
        )
        .then((response) => setResults(response.results))
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, open, query]);

  const visit = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Navigate Backsteros"
      overlayClassName="command-overlay"
      contentClassName="command-dialog"
    >
      <div className="command-chrome">
        <div className="command-input-row">
          <Icon name="search" />
          <Command.Input
            autoFocus
            className="command-input"
            placeholder="Search or jump to…"
            value={query}
            onValueChange={setQuery}
          />
          <kbd>⌘K</kbd>
        </div>
        <Command.List className="command-list">
          <Command.Empty className="command-empty">No destination found.</Command.Empty>
          <Command.Group heading="Navigate">
            {navigation.map((item) => (
              <Command.Item
                key={item.href}
                value={`${item.label} ${item.href}`}
                className="command-item"
                onSelect={() => visit(item.href)}
              >
                <span className="nav-icon"><Icon name={item.icon} /></span>
                <span>{item.label}</span>
                <small>{item.href}</small>
              </Command.Item>
            ))}
          </Command.Group>
          {query.trim().length >= 2 ? (
            <Command.Group heading={searching ? "Searching…" : "Workspace"}>
              {results.map((result) => {
                const family = result.type === "document" ? "knowledge" : `${result.type}s`;
                return (
                  <Command.Item
                    key={`${result.type}:${result.id}`}
                    value={`${result.title} ${result.snippet ?? ""}`}
                    className="command-item"
                    onSelect={() => visit(`/${family}/${result.id}`)}
                  >
                    <span>{result.title}</span>
                    <small>{result.type}</small>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
