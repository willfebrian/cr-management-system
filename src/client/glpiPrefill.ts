const GLPI_TICKET_FORM_URL = "https://itsm.trst.co.id/front/ticket.form.php";
const SAP_ABAP_GROUP_ID = "31";
const SAP_BASIS_GROUP_ID = "40";

export type GlpiPrefillSubmission = {
  action: string;
  method: "GET";
  target: "_blank";
  fields: Record<string, string>;
  url: string;
};

export function formatGlpiOpeningDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildGlpiPrefillSubmission(input: {
  title: string;
  descriptionHtml: string;
  openedAt: string;
  abaperGlpiUserIds: number[];
}): GlpiPrefillSubmission {
  const fields: Record<string, string> = {
    name: input.title,
    content: input.descriptionHtml,
    date: input.openedAt,
    type: "2",
    itilcategories_id: "121",
    requesttypes_id: "2",
    locations_id: "1",
    _skip_default_actor: "1",
    "_actors[requester][0][itemtype]": "Group",
    "_actors[requester][0][items_id]": SAP_ABAP_GROUP_ID,
    "_actors[observer][0][itemtype]": "Group",
    "_actors[observer][0][items_id]": SAP_ABAP_GROUP_ID,
    "_actors[observer][1][itemtype]": "Group",
    "_actors[observer][1][items_id]": SAP_BASIS_GROUP_ID
  };
  input.abaperGlpiUserIds.forEach((id, index) => {
    const requesterIndex = index + 1;
    fields[`_actors[requester][${requesterIndex}][itemtype]`] = "User";
    fields[`_actors[requester][${requesterIndex}][items_id]`] = String(id);
    fields[`_actors[requester][${requesterIndex}][use_notification]`] = "1";
    fields[`_actors[assign][${index}][itemtype]`] = "User";
    fields[`_actors[assign][${index}][items_id]`] = String(id);
    fields[`_actors[assign][${index}][use_notification]`] = "1";
  });
  const url = new URL(GLPI_TICKET_FORM_URL);
  for (const [name, value] of Object.entries(fields)) {
    url.searchParams.set(name, value);
  }

  return {
    action: GLPI_TICKET_FORM_URL,
    method: "GET",
    target: "_blank",
    fields,
    url: url.toString()
  };
}

type GlpiPrefillWindow = {
  open(url: string, target: string): unknown;
};

export function submitGlpiPrefill(
  windowLike: GlpiPrefillWindow,
  submission: GlpiPrefillSubmission
) {
  windowLike.open(submission.url, submission.target);
}
