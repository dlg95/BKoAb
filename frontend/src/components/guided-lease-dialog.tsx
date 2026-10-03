import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type GuidedLeaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** e.g. Zimmer / Wohnung */
  subUnitLabel: string
  subUnitName: string
  /** Absolute path to navigate to on confirm (legacy). */
  leasesPath?: string
  /** Called on confirm instead of navigating, e.g. to open the lease dialog in place. */
  onConfirm?: () => void
}

/** Soft prompt after creating a subunit — not mandatory. */
export function GuidedLeaseDialog({
  open,
  onOpenChange,
  subUnitLabel,
  subUnitName,
  leasesPath,
  onConfirm,
}: GuidedLeaseDialogProps) {
  const navigate = useNavigate()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subUnitLabel} angelegt</DialogTitle>
          <DialogDescription>
            „{subUnitName}“ ist bereit. Als Nächstes können Sie mindestens eine Mietpartei dafür
            anlegen — empfohlen für die Abrechnung, aber nicht verpflichtend.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Später
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false)
              if (onConfirm) onConfirm()
              else if (leasesPath) navigate(leasesPath)
            }}
          >
            Mietpartei anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
