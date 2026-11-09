"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { listCampaigns } from "@/features/campaigns/api/campaigns-gateway";
import { zonedLocalToUtcIso } from "@/lib/app-timezone";
import { collectAllPages } from "@/lib/collect-all-pages";

import {
  createCreativeRequest,
  type CreateCreativeRequestInput,
} from "../api/creative-requests-gateway";
import {
  CREATIVE_ASSET_TYPE_LABELS,
  CREATIVE_ASSET_TYPES,
  type CreativeAssetType,
  type CreativeRequest,
} from "../lib/creative-requests-types";

const NO_CAMPAIGN = "none";

interface CampaignOption {
  id: string;
  name: string;
}

/** Promotion campaigns the request may be linked to, every page of them. */
function usePromotionCampaigns(open: boolean) {
  const [state, setState] = useState<{
    options: CampaignOption[];
    failed: boolean;
  }>({ options: [], failed: false });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    collectAllPages((page) =>
      listCampaigns(
        { campaignType: "PROMOTION", page, pageSize: 100 },
        controller.signal,
      ),
    ).then(
      (items) =>
        setState({
          options: items.map((item) => ({ id: item.id, name: item.name })),
          failed: false,
        }),
      () => {
        if (!controller.signal.aborted) setState({ options: [], failed: true });
      },
    );
    return () => controller.abort();
  }, [open]);
  return state;
}

export function CreateCreativeRequestDialog({
  open,
  onOpenChange,
  onCreated,
  create = createCreativeRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (request: CreativeRequest) => void;
  /** Injected in tests. */
  create?: (input: CreateCreativeRequestInput) => Promise<CreativeRequest>;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [assetType, setAssetType] = useState<CreativeAssetType>("POSTER");
  const [requirements, setRequirements] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [campaignId, setCampaignId] = useState(NO_CAMPAIGN);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const campaigns = usePromotionCampaigns(open);

  function close(next: boolean) {
    if (!next) {
      setTitle("");
      setAssetType("POSTER");
      setRequirements("");
      setDueAt("");
      setCampaignId(NO_CAMPAIGN);
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !requirements.trim()) {
      setError("Give the request a title and say what you need.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await create({
        title: title.trim(),
        assetType,
        requirements: requirements.trim(),
        ...(dueAt && zonedLocalToUtcIso(dueAt)
          ? { dueAt: zonedLocalToUtcIso(dueAt)! }
          : {}),
        ...(campaignId !== NO_CAMPAIGN ? { campaignId } : {}),
      });
      onCreated(created);
      close(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not send the request. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New creative request</DialogTitle>
          <DialogDescription>
            Ask Production for posters, videos and other materials. Production
            accepts it and turns it into a task.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-type`}>Asset type</Label>
            <Select
              value={assetType}
              onValueChange={(value) =>
                setAssetType(value as CreativeAssetType)
              }
            >
              <SelectTrigger id={`${id}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATIVE_ASSET_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CREATIVE_ASSET_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-requirements`}>Requirements</Label>
            <Textarea
              id={`${id}-requirements`}
              value={requirements}
              maxLength={5000}
              rows={5}
              placeholder="Sizes, formats, wording, branding and anything Production must know."
              onChange={(event) => setRequirements(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-due`}>Needed by (optional)</Label>
              <Input
                id={`${id}-due`}
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-campaign`}>Campaign (optional)</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id={`${id}-campaign`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAMPAIGN}>No campaign</SelectItem>
                  {campaigns.options.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {campaigns.failed ? (
                <p className="text-muted-foreground text-xs">
                  Campaigns could not be loaded. You can still send the request.
                </p>
              ) : null}
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
