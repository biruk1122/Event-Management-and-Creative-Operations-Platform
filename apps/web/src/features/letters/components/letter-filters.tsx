"use client";

import { useId } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import styles from "./letters-presentation.module.css";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  LETTER_CATEGORY_LABELS,
  type LetterCategory,
} from "../lib/letters-types";

const ALL = "ALL";

export interface LetterProjectOption {
  id: string;
  name: string;
}

interface LetterFiltersProps {
  search: string;
  category: LetterCategory | null;
  projectId: string | null;
  projects: readonly LetterProjectOption[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: LetterCategory | null) => void;
  onProjectChange: (value: string | null) => void;
}

export function LetterFilters({
  search,
  category,
  projectId,
  projects,
  onSearchChange,
  onCategoryChange,
  onProjectChange,
}: LetterFiltersProps) {
  const searchId = useId();
  const categoryId = useId();
  const projectFilterId = useId();

  return (
    <div data-admin-filters className={styles.filters}>
      <div className={styles.searchFilter}>
        <Label htmlFor={searchId}>Search</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Reference, subject, sender/recipient, project"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.selectFilter}>
        <Label htmlFor={projectFilterId}>Project</Label>
        <Select
          value={projectId ?? ALL}
          onValueChange={(value) =>
            onProjectChange(value === ALL ? null : value)
          }
        >
          <SelectTrigger id={projectFilterId} aria-label="Filter by project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.selectFilter}>
        <Label htmlFor={categoryId}>Category</Label>
        <Select
          value={category ?? ALL}
          onValueChange={(value) =>
            onCategoryChange(value === ALL ? null : (value as LetterCategory))
          }
        >
          <SelectTrigger id={categoryId} aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {Object.entries(LETTER_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
