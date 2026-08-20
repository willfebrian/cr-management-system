export async function runTemplatePreviewAction(
  action: "copy" | "open-glpi",
  handlers: { copy(): Promise<void>; openGlpi(): void }
) {
  if (action === "copy") {
    await handlers.copy();
    return;
  }
  handlers.openGlpi();
}
