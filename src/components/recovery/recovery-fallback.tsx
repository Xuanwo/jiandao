import { useSetAtom } from "jotai"
import { useState } from "react"
import { i18n } from "#imports"
import { ConfirmAction } from "@/components/confirm-action"
import { IconAlertCircle } from "@/components/icons"
import { toast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { writeConfigAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

interface RecoveryFallbackProps {
  error: Error | null
  onRecovered: () => void
}

export function RecoveryFallback({ error, onRecovered }: RecoveryFallbackProps) {
  const setConfig = useSetAtom(writeConfigAtom)
  const [isResetting, setIsResetting] = useState(false)

  const handleResetConfig = async () => {
    setIsResetting(true)
    try {
      await setConfig(DEFAULT_CONFIG)
      toast.success(i18n.t("errorRecovery.resetSuccess"))
      onRecovered()
    }
    catch {
      toast.error(i18n.t("errorRecovery.resetFailed"))
    }
    finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="w-full min-h-full p-4 md:p-6">
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-4 md:p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{i18n.t("errorRecovery.title")}</h2>
          <p className="text-sm text-muted-foreground">{i18n.t("errorRecovery.description")}</p>
        </div>

        {error?.message && (
          <div role="alert" className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 rounded-lg border border-destructive bg-destructive/5 px-4 py-3 text-left text-sm text-destructive">
            <IconAlertCircle className="row-span-2 size-4 translate-y-0.5" />
            <div className="font-medium">{i18n.t("errorRecovery.errorDetails")}</div>
            <div className="min-w-0 break-words text-card-foreground [overflow-wrap:anywhere]">{error.message}</div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{i18n.t("errorRecovery.recoveryTitle")}</p>
          <Button onClick={() => window.location.reload()}>
            {i18n.t("errorRecovery.refreshPage")}
          </Button>
          <ConfirmAction
            disabled={isResetting}
            trigger={props => <Button variant="destructive" {...props}>{i18n.t("errorRecovery.resetAction")}</Button>}
            title={i18n.t("errorRecovery.resetDialog.title")}
            description={i18n.t("errorRecovery.resetDialog.description")}
            confirmLabel={i18n.t("errorRecovery.resetDialog.confirm")}
            cancelLabel={i18n.t("errorRecovery.resetDialog.cancel")}
            onConfirm={handleResetConfig}
          />
        </div>
      </div>
    </div>
  )
}
