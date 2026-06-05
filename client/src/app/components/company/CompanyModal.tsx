import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { X, Building2, Hash, Save, Loader2 } from "lucide-react";
import type { Company, CreateCompanyPayload } from "../../api/companyApi";

interface Props {
  mode: "create" | "edit" | "view";
  company?: Company | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCompanyPayload) => void;
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function CompanyModal({ mode, company, loading, onClose, onSubmit }: Props) {
  const isView = mode === "view";

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreateCompanyPayload>({
    defaultValues: { companyName: "", panNumber: "" },
  });

  useEffect(() => {
    if (company) {
      reset({ companyName: company.companyName, panNumber: company.panNumber });
    } else {
      reset({ companyName: "", panNumber: "" });
    }
  }, [company, reset]);

  const panValue = watch("panNumber");

  const titles = { create: "Create Company", edit: "Edit Company", view: "Company Details" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Building2 size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-slate-900 text-base">{titles[mode]}</h2>
              {company && <p className="text-xs text-slate-500 mt-0.5">ID: {company._id}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Company Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                {...register("companyName", {
                  required: "Company name is required",
                  minLength: { value: 2, message: "Minimum 2 characters required" },
                  maxLength: { value: 100, message: "Maximum 100 characters allowed" },
                })}
                readOnly={isView}
                placeholder="e.g. Acme Corp Ltd."
                className={`w-full pl-9 pr-3 py-2.5 rounded-lg text-sm transition-all outline-none
                  ${isView
                    ? "bg-slate-50 border border-slate-200 text-slate-700 cursor-default"
                    : errors.companyName
                    ? "bg-red-50 border border-red-300 text-slate-800 focus:ring-2 focus:ring-red-100 focus:border-red-400"
                    : "bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  }`}
              />
            </div>
            {errors.companyName && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">!</span>
                {errors.companyName.message}
              </p>
            )}
          </div>

          {/* PAN Number */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              PAN Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                {...register("panNumber", {
                  required: "PAN number is required",
                  validate: (v) =>
                    PAN_REGEX.test(v.toUpperCase()) ||
                    "Invalid PAN format — must be AAAAA9999A (5 letters, 4 digits, 1 letter)",
                })}
                readOnly={isView}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                onChange={(e) => setValue("panNumber", e.target.value.toUpperCase(), { shouldValidate: true, shouldDirty: true })}
                value={panValue?.toUpperCase() ?? ""}
                className={`w-full pl-9 pr-3 py-2.5 rounded-lg text-sm font-mono tracking-widest transition-all outline-none
                  ${isView
                    ? "bg-slate-50 border border-slate-200 text-slate-700 cursor-default"
                    : errors.panNumber
                    ? "bg-red-50 border border-red-300 text-slate-800 focus:ring-2 focus:ring-red-100 focus:border-red-400"
                    : "bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  }`}
              />
              {/* PAN format badge */}
              <div className={`absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-colors
                ${!panValue ? "bg-slate-300" : PAN_REGEX.test(panValue) ? "bg-emerald-500" : "bg-red-400"}`}
              />
            </div>
            {errors.panNumber && (
              <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0 mt-px">!</span>
                {errors.panNumber.message}
              </p>
            )}
            {!errors.panNumber && !isView && (
              <p className="mt-1.5 text-xs text-slate-400">Format: 5 letters · 4 digits · 1 letter (e.g. ABCDE1234F)</p>
            )}
          </div>

          {/* Created At — view mode only */}
          {isView && company && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Created At</label>
              <input
                readOnly
                value={new Date(company.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 cursor-default"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {isView ? "Close" : "Cancel"}
            </button>
            {!isView && (
              <button
                type="submit"
                disabled={loading || (!isDirty && mode === "edit")}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {mode === "create" ? "Create Company" : "Save Changes"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
