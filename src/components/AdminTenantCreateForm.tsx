"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_TENANT_CREATE_FORM_VALUES,
  type TenantCreateFormErrors,
  type TenantCreateFormValues,
  normalizeTenantCreateFormValues,
  validateTenantCreateFormValues,
} from "@/lib/admin-tenant-validation";

type FieldName = keyof TenantCreateFormValues;

type FieldProps = {
  name: FieldName;
  label: string;
  helperText: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  values: TenantCreateFormValues;
  errors: TenantCreateFormErrors;
  touched: Partial<Record<FieldName, boolean>>;
  onChange: (name: FieldName, value: string) => void;
  onBlur: (name: FieldName) => void;
};

function Field({
  name,
  label,
  helperText,
  required = false,
  placeholder,
  type = "text",
  multiline = false,
  values,
  errors,
  touched,
  onChange,
  onBlur,
}: FieldProps) {
  const inputId = `tenant-create-${name}`;
  const error = touched[name] ? errors[name] : undefined;
  const describedBy = error ? `${inputId}-hint ${inputId}-error` : `${inputId}-hint`;
  const commonProps = {
    id: inputId,
    name,
    value: values[name],
    placeholder,
    onBlur: () => onBlur(name),
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => onChange(name, event.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: "w-full rounded-2xl border px-4 py-3 text-sm",
    style: {
      borderColor: error ? "#dc2626" : "var(--widget-border)",
      background: "var(--widget-surface)",
      color: "var(--widget-text)",
    },
  };

  return (
    <label htmlFor={inputId} className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--widget-text)" }}>
        <span>{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            background: required ? "rgba(190, 24, 93, 0.12)" : "rgba(15, 23, 42, 0.08)",
            color: required ? "#9d174d" : "var(--widget-text-muted)",
          }}
        >
          {required ? "Required" : "Optional"}
        </span>
      </span>
      {multiline ? <Textarea {...commonProps} rows={3} /> : <Input {...commonProps} type={type} />}
      <span id={`${inputId}-hint`} className="block text-xs" style={{ color: "var(--widget-text-muted)" }}>
        {helperText}
      </span>
      {error ? (
        <span id={`${inputId}-error`} className="block text-xs font-medium" style={{ color: "#b91c1c" }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

export default function AdminTenantCreateForm() {
  const [values, setValues] = useState<TenantCreateFormValues>(EMPTY_TENANT_CREATE_FORM_VALUES);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errors = useMemo(() => validateTenantCreateFormValues(values), [values]);

  function updateValue(name: FieldName, value: string) {
    setValues((current) => {
      const next = normalizeTenantCreateFormValues({ ...current, [name]: value });
      return next;
    });
    setSubmitError("");
  }

  function markTouched(name: FieldName) {
    setTouched((current) => ({ ...current, [name]: true }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      name: true,
      tenantKey: true,
      appName: true,
      appUrl: true,
      domains: true,
      assistantName: true,
      headerTitle: true,
      launcherLabel: true,
      inputPlaceholder: true,
      supportUrl: true,
      storeLocatorUrl: true,
      handoffDescription: true,
    });

    const nextErrors = validateTenantCreateFormValues(values);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError("Please fix the highlighted fields before creating the tenant.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const formData = new FormData();
      for (const [key, value] of Object.entries(values)) {
        formData.append(key, value);
      }

      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: TenantCreateFormErrors;
        } | null;

        if (result?.fieldErrors) {
          setTouched({
            name: true,
            tenantKey: true,
            appName: true,
            appUrl: true,
            domains: true,
            assistantName: true,
            headerTitle: true,
            launcherLabel: true,
            inputPlaceholder: true,
            supportUrl: true,
            storeLocatorUrl: true,
            handoffDescription: true,
          });
        }

        throw new Error(result?.error || "Failed to create tenant.");
      }

      window.location.assign("/admin");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create tenant.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface-alt)", color: "var(--widget-text-muted)" }}>
        Fields marked <strong>Required</strong> must be filled in. Everything else is optional and can be added later.
      </div>

      {submitError ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
          {submitError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          name="name"
          label="Tenant name"
          required
          placeholder="Acme Sleep"
          helperText="The brand or client name shown in admin and used as the default brand label."
          values={values}
          errors={errors}
          touched={touched}
          onChange={updateValue}
          onBlur={markTouched}
        />
        <Field
          name="tenantKey"
          label="Tenant key"
          required
          placeholder="acme-sleep"
          helperText="Use lowercase letters, numbers, dashes, or underscores. This becomes the tenant identifier."
          values={values}
          errors={errors}
          touched={touched}
          onChange={updateValue}
          onBlur={markTouched}
        />
        <Field
          name="appName"
          label="App name"
          placeholder="Shop Assist"
          helperText="Display name for the experience. If left blank, it falls back to the tenant name."
          values={values}
          errors={errors}
          touched={touched}
          onChange={updateValue}
          onBlur={markTouched}
        />
        <Field
          name="appUrl"
          label="Primary website URL"
          placeholder="https://client-site.com"
          type="url"
          helperText="Optional, but recommended for branding and support links. Must be a full URL."
          values={values}
          errors={errors}
          touched={touched}
          onChange={updateValue}
          onBlur={markTouched}
        />
        <div className="md:col-span-2">
          <Field
            name="domains"
            label="Allowed domains"
            placeholder="client-site.com, staging.client-site.com"
            helperText="Comma-separated hostnames only. Do not include https:// or page paths."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--widget-text)" }}>
            Widget copy
          </h3>
          <p className="text-xs" style={{ color: "var(--widget-text-muted)" }}>
            These are optional labels for the embedded chat experience.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            name="assistantName"
            label="Assistant name"
            placeholder="Shop Assist"
            helperText="Name shown as the assistant inside the widget."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
          <Field
            name="headerTitle"
            label="Header title"
            placeholder="Chat with Shop Assist"
            helperText="Main title displayed at the top of the chat window."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
          <Field
            name="launcherLabel"
            label="Launcher label"
            placeholder="Ask Shop Assist"
            helperText="Button label used for the widget launcher."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
          <Field
            name="inputPlaceholder"
            label="Input placeholder"
            placeholder="Ask about comfort, support, or price"
            helperText="Hint shown inside the message input box before the visitor types."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--widget-text)" }}>
            Support and handoff
          </h3>
          <p className="text-xs" style={{ color: "var(--widget-text-muted)" }}>
            Optional links and copy used when the assistant needs to point someone elsewhere.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            name="supportUrl"
            label="Support URL"
            placeholder="https://client-site.com/help"
            type="url"
            helperText="Where to send customers for support or customer care."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
          <Field
            name="storeLocatorUrl"
            label="Store locator URL"
            placeholder="https://client-site.com/stores"
            type="url"
            helperText="Optional link to a showroom or store finder page."
            values={values}
            errors={errors}
            touched={touched}
            onChange={updateValue}
            onBlur={markTouched}
          />
          <div className="md:col-span-2">
            <Field
              name="handoffDescription"
              label="Handoff description"
              placeholder="customer care team"
              multiline
              helperText="Short phrase the assistant can use when handing the visitor off to a human team."
              values={values}
              errors={errors}
              touched={touched}
              onChange={updateValue}
              onBlur={markTouched}
            />
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        size="lg"
        className="w-full sm:w-auto"
      >
        {isSubmitting ? "Creating tenant..." : "Create tenant"}
      </Button>
    </form>
  );
}