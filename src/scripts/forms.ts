/**
 * Progressive enhancement for forms marked `data-ajax-form`.
 * Without JavaScript the form posts normally and the server redirects to a
 * confirmation page. With JavaScript it validates inline and submits via fetch.
 */

interface FormResponse {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

const loadedAt = performance.now();
const enhanced = new WeakSet<HTMLFormElement>();

const MESSAGES = {
  invalid: 'Please check the highlighted fields.',
  network: 'We could not send your message. Please check your connection and try again.',
  server: 'Something went wrong on our side. Please try again in a few minutes.',
  sending: 'Sending…',
};

function setStatus(form: HTMLFormElement, message: string, state: 'idle' | 'error' | 'success') {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function fieldsOf(form: HTMLFormElement) {
  return Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.input'),
  );
}

function validate(form: HTMLFormElement): boolean {
  let firstInvalid: HTMLElement | undefined;
  for (const field of fieldsOf(form)) {
    const value = field.value.trim();
    if (field.value !== value && !(field instanceof HTMLSelectElement)) field.value = value;
    const valid = field.checkValidity();
    field.setAttribute('aria-invalid', String(!valid));
    if (!valid && !firstInvalid) firstInvalid = field;
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

function markServerErrors(form: HTMLFormElement, errors: Record<string, string>) {
  for (const name of Object.keys(errors)) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLElement) field.setAttribute('aria-invalid', 'true');
  }
}

async function submit(form: HTMLFormElement, button: HTMLButtonElement | null) {
  const elapsed = form.querySelector<HTMLInputElement>('[data-elapsed]');
  if (elapsed) elapsed.value = String(Math.round(performance.now() - loadedAt));

  button?.setAttribute('disabled', '');
  setStatus(form, MESSAGES.sending, 'idle');

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    let data: FormResponse | undefined;
    try {
      data = (await response.json()) as FormResponse;
    } catch {
      data = undefined;
    }

    if (response.ok && data?.ok) {
      form.reset();
      fieldsOf(form).forEach((f) => f.removeAttribute('aria-invalid'));
      setStatus(form, form.dataset.success ?? data.message ?? 'Thank you.', 'success');
      return;
    }

    if (data?.errors) markServerErrors(form, data.errors);
    // Only blame the visitor's input when our endpoint actually said so (a 4xx JSON
    // reply). Anything else (an HTML error page, 404, 5xx) is a problem on our side.
    const fromEndpoint = data !== undefined && response.status >= 400 && response.status < 500;
    const fallback = fromEndpoint ? MESSAGES.invalid : MESSAGES.server;
    setStatus(form, data?.message ?? fallback, 'error');
  } catch {
    setStatus(form, MESSAGES.network, 'error');
  } finally {
    button?.removeAttribute('disabled');
  }
}

export function enhanceForms(root: ParentNode = document) {
  for (const form of root.querySelectorAll<HTMLFormElement>('form[data-ajax-form]')) {
    if (enhanced.has(form)) continue;
    enhanced.add(form);

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    form.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target.getAttribute('aria-invalid') === 'true' && 'checkValidity' in target) {
        target.setAttribute('aria-invalid', String(!(target as HTMLInputElement).checkValidity()));
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (button?.hasAttribute('disabled')) return;
      if (!validate(form)) {
        setStatus(form, MESSAGES.invalid, 'error');
        return;
      }
      void submit(form, button);
    });
  }
}
