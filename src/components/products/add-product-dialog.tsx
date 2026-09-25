"use client";

import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Factory, LoaderCircle } from "lucide-react";
import { productCreateSchema } from "@/lib/validation/schemas";
import { ApiClientError } from "@/lib/client/api";
import { useCreateProduct } from "@/lib/client/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

/** Client form values mirror the server's productCreateSchema (zod input type). */
type FormValues = z.input<typeof productCreateSchema>;

const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"] as const;

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin-only "Add Product" dialog. Validation runs client-side (shared Zod
 * schema, same rules as the server) AND server-side (POST /api/products) —
 * the frontend is never trusted. On success the product list + dashboard
 * counts invalidate and refetch.
 */
export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps) {
  const createProduct = useCreateProduct();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: { sku: "", name: "", description: "", status: "DRAFT" },
  });

  const close = useCallback(() => {
    if (isSubmitting) return;
    setFormError(null);
    reset();
    onOpenChange(false);
  }, [isSubmitting, onOpenChange, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await createProduct.mutateAsync({
        sku: values.sku,
        name: values.name,
        description: values.description || undefined,
        status: (values.status ?? "DRAFT") as "DRAFT" | "ACTIVE" | "INACTIVE",
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setFormError(
        err instanceof ApiClientError
          ? err.message
          : "Unable to create the product. Please try again."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Factory className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>
            Register a new product. BOMs, routings and readiness checks can be added after
            activation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              autoComplete="off"
              placeholder="e.g. SWX-1100"
              aria-invalid={Boolean(errors.sku)}
              {...register("sku")}
            />
            {errors.sku ? (
              <p role="alert" className="text-sm text-danger">
                {errors.sku.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="off"
              placeholder="e.g. Smart Watch X2"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p role="alert" className="text-sm text-danger">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              autoComplete="off"
              placeholder="Optional short description"
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  value={field.value ?? "DRAFT"}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="status" aria-label="Status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}