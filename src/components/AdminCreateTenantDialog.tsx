"use client";

import { useState } from "react";
import AdminTenantCreateForm from "@/components/AdminTenantCreateForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AdminCreateTenantDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">Create tenant</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create tenant</DialogTitle>
          <DialogDescription>
            Add a new merchant tenant without cluttering the main admin screen. This opens the full setup form in a focused modal.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <AdminTenantCreateForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}