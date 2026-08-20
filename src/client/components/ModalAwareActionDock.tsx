import type { ReactNode } from "react";

export function ModalAwareActionDock(props: { modalOpen: boolean; children: ReactNode }) {
  return (
    <div
      className={`sticky-actions${props.modalOpen ? " sticky-actions--modal-disabled" : ""}`}
      aria-disabled={props.modalOpen || undefined}
      inert={props.modalOpen ? true : undefined}
    >
      {props.children}
    </div>
  );
}
