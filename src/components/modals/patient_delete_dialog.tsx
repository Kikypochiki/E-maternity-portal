"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"

interface PatientDeleteDialogProps {
  patientId: string
  patientName: string
  onPatientDeleted?: () => void
}

export function PatientDeleteDialog({ patientId, patientName, onPatientDeleted }: PatientDeleteDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    try {
      setIsDeleting(true)

      const { error } = await supabase.from("patient_basic_info").delete().eq("patient_id", patientId)

      if (error) {
        console.error("Error deleting patient:", error.message)
        toast("Failed to delete patient. Please try again.")
      } else {
        console.log("Patient deleted successfully")
        toast("Patient has been deleted successfully.")

        if (onPatientDeleted) {
          onPatientDeleted()
        }
      }
    } catch (error) {
      console.error("Unexpected error:", error)
      toast("An unexpected error occurred. Please try again.")
    } finally {
      setIsDeleting(false)
      setIsOpen(false)
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setIsOpen(true)} className="bg-red-600 hover:bg-red-700">
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Patient Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {patientName}'s record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

