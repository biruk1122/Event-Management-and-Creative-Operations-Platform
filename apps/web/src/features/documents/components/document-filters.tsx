"use client";

import { useId } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import styles from "./documents-presentation.module.css";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "../lib/documents-types";

const ALL = "ALL";

export interface DocumentProjectOption {
  id: string;
  name: string;
}

interface DocumentFiltersProps {
  search: string;
  documentType: DocumentType | null;
  projectId: string | null;
  projects: readonly DocumentProjectOption[];
  onSearchChange: (value: string) => void;
  onDocumentTypeChange: (value: DocumentType | null) => void;
  onProjectChange: (value: string | null) => void;
}

export function DocumentFilters({
  search,
  documentType,
  projectId,
  projects,
  onSearchChange,
  onDocumentTypeChange,
  onProjectChange,
}: DocumentFiltersProps) {
  const searchId = useId();
  const typeId = useId();
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
            placeholder="Name, filename, document of"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.selectFilter}>
        <Label htmlFor={projectFilterId}>Document of</Label>
        <Select
          value={projectId ?? ALL}
          onValueChange={(value) =>
            onProjectChange(value === ALL ? null : value)
          }
        >
          <SelectTrigger
            id={projectFilterId}
            aria-label="Filter by document of"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All documents</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.selectFilter}>
        <Label htmlFor={typeId}>Type</Label>
        <Select
          value={documentType ?? ALL}
          onValueChange={(value) =>
            onDocumentTypeChange(value === ALL ? null : (value as DocumentType))
          }
        >
          <SelectTrigger id={typeId} aria-label="Filter by document type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
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
