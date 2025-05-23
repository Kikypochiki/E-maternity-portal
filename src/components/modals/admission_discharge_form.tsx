"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Loader2, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface AdmissionDischargeFormProps {
  admissionId: string
  patientName: string
  onPatientDischarged?: () => void
  trigger: React.ReactNode
}

export function AdmissionDischargeForm({
  admissionId,
  patientName,
  onPatientDischarged,
  trigger,
}: AdmissionDischargeFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [finalDiagnosis, setFinalDiagnosis] = useState("")
  const [finalDiagnosisIcdCode, setFinalDiagnosisIcdCode] = useState("")
  const [resultStatus, setResultStatus] = useState("")
  const [resultCondition, setResultCondition] = useState("")
  const [isAlreadyDischarged, setIsAlreadyDischarged] = useState(false)

  // Check admission status when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkAdmissionStatus()
    }
  }, [isOpen])

  const checkAdmissionStatus = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from("Admissions")
        .select("admission_status")
        .eq("admission_id", admissionId)
        .single()

      if (error) {
        console.error("Error checking admission status:", error.message)
        toast("Failed to check admission status. Please try again.")
        setIsOpen(false)
        return
      }

      if (data && data.admission_status === "Discharged") {
        setIsAlreadyDischarged(true)
      } else {
        setIsAlreadyDischarged(false)
      }
    } catch (error) {
      console.error("Unexpected error:", error)
      toast("An unexpected error occurred. Please try again.")
      setIsOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDischarge = async () => {
    if (!finalDiagnosis || !finalDiagnosisIcdCode || !resultStatus || !resultCondition) {
      toast("Please fill in all required fields");
      return;
    }
  
    try {
      setIsProcessing(true);
      const dischargeDateTime = new Date().toISOString();
  
      // 1. First handle the Admission record updates
      // --------------------------------------------------
      const { data: admissionData, error: admissionError } = await supabase
        .from("Admissions")
        .select("created_at")
        .eq("admission_id", admissionId)
        .single();
  
      if (admissionError) {
        console.error("Error retrieving admission data:", admissionError.message);
        toast("Failed to retrieve admission data. Please try again.");
        return;
      }
  
      // Calculate length of stay
      const admissionDate = new Date(admissionData.created_at);
      const dischargeDate = new Date();
      const lengthOfStayHours = Math.round(
        ((dischargeDate.getTime() - admissionDate.getTime()) / (1000 * 3600)) * 10
      ) / 10;
  
      // Update admission status
      const { error: updateError } = await supabase
        .from("Admissions")
        .update({
          admission_status: "Discharged",
          final_diagnosis: finalDiagnosis,
          final_diagnosis_icd_code: finalDiagnosisIcdCode,
          discharge_datetime: dischargeDateTime,
          length_of_stay_hours: lengthOfStayHours,
          result_status: resultStatus,
          result_condition: resultCondition,
        })
        .eq("admission_id", admissionId);
  
      if (updateError) {
        console.error("Error updating admission record:", updateError.message);
        toast("Failed to discharge patient. Please try again.");
        return;
      }
  
      // Archive admission to history
      const { data: admissionFullData, error: fetchError } = await supabase
        .from("Admissions")
        .select("*")
        .eq("admission_id", admissionId)
        .single();
  
      if (!fetchError && admissionFullData) {
        const historyRecord = {
          ...admissionFullData,
          admission_status: "Discharged",
          final_diagnosis: finalDiagnosis,
          final_diagnosis_icd_code: finalDiagnosisIcdCode,
          discharge_datetime: dischargeDateTime,
          length_of_stay_hours: lengthOfStayHours,
          result_status: resultStatus,
          result_condition: resultCondition,
        };
  
        await supabase.from("AdmissionsHistory").insert([historyRecord]);
      }
  
      // 2. Handle DoctorsOrders separately
      // --------------------------------------------------
      const { data: orders, error: ordersError } = await supabase
        .from("DoctorsOrders")
        .select("*")
        .eq("admission_id", admissionId);
  
      if (ordersError) {
        console.error("Error fetching doctor's orders:", ordersError.message);
        toast("Warning: Failed to fetch doctor's orders for archiving");
      } else if (orders && orders.length > 0) {
        const ordersForHistory = orders.map(order => ({
          ...order,
        }));
  
        const { error: historyInsertError } = await supabase
          .from("DoctorsOrdersHistory")
          .insert(ordersForHistory);
  
        if (historyInsertError) {
          console.error("Error archiving doctor's orders:", historyInsertError.message);
          toast("Warning: Failed to archive doctor's orders");
        }
  
        const { error: deleteError } = await supabase
          .from("DoctorsOrders")
          .delete()
          .eq("admission_id", admissionId)
          .eq("patient_id", admissionFullData.patient_id);
  
        if (deleteError) {
          console.error("Error deleting doctor's orders:", deleteError.message);
          toast("Warning: Failed to delete active doctor's orders");
        }
      }
  
      // 3. Handle Medications separately
      // --------------------------------------------------
      const { data: medications, error: medicationsError } = await supabase
        .from("Medications")
        .select("*")
        .eq("admission_id", admissionId)
        .eq("patient_id", admissionFullData.patient_id);
        
  
      if (medicationsError) {
        console.error("Error fetching medications:", medicationsError.message);
        toast("Warning: Failed to fetch medications for archiving");
      } else if (medications && medications.length > 0) {
        const medicationsForHistory = medications.map(medication => ({
          ...medication,
        }));
  
        const { error: medHistoryInsertError } = await supabase
          .from("MedicationsHistory")
          .insert(medicationsForHistory);
  
        if (medHistoryInsertError) {
          console.error("Error archiving medications:", medHistoryInsertError.message);
          toast("Warning: Failed to archive medications");
        }
  
        const { error: deleteMedError } = await supabase
          .from("Medications")
          .delete()
          .eq("admission_id", admissionId)
          .eq("patient_id", admissionFullData.patient_id);
          
        if (deleteMedError) {
          console.error("Error deleting medications:", deleteMedError.message);
          toast("Warning: Failed to delete active medications");
        }
      }

      // 4. Handle Notes separately
      const { data: notes, error: notesError } = await supabase
        .from("Notes")
        .select("*")
        .eq("admission_id", admissionId)
        .eq("patient_id", admissionFullData.patient_id);
        
  
      if (notesError) {
        console.error("Error fetching notes:", notesError.message);
        toast("Warning: Failed to fetch notes for archiving");
      } else if (notes && notes.length > 0) {
        const notesForHistory = notes.map(notes => ({
          ...notes,
        }));
  
        const { error: notesHistoryInsertError } = await supabase
          .from("NotesHistory")
          .insert(notesForHistory);
  
        if (notesHistoryInsertError) {
          console.error("Error archiving notes:", notesHistoryInsertError.message);
          toast("Warning: Failed to archive notes");
        }
  
        const { error: deleteNotesError } = await supabase
          .from("Notes")
          .delete()
          .eq("admission_id", admissionId)
          .eq("patient_id", admissionFullData.patient_id);
          
        if (deleteNotesError) {
          console.error("Error deleting notes:", deleteNotesError.message);
          toast("Warning: Failed to delete active notes");
        }
      }
  
      // 4. Finalize
      // --------------------------------------------------
      toast("Patient has been discharged successfully. All records archived.");
      if (onPatientDischarged) {
        onPatientDischarged();
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      toast("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
      setIsOpen(false);
    }
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)}>{trigger}</div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Discharge Patient</DialogTitle>
            <DialogDescription>Complete the discharge process for {patientName}.</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isAlreadyDischarged ? (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Already Discharged</AlertTitle>
              <AlertDescription>
                This patient has already been discharged and cannot be discharged again.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="final-diagnosis">Final Diagnosis</Label>
                  <Textarea
                    id="final-diagnosis"
                    value={finalDiagnosis}
                    onChange={(e) => setFinalDiagnosis(e.target.value)}
                    placeholder="Enter final diagnosis"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="icd-code">Final Diagnosis ICD Code</Label>
                  <Input
                    id="icd-code"
                    value={finalDiagnosisIcdCode}
                    onChange={(e) => setFinalDiagnosisIcdCode(e.target.value)}
                    placeholder="Enter ICD code"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="result-status">Result Status</Label>
                    <Select value={resultStatus} onValueChange={setResultStatus}>
                      <SelectTrigger id="result-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="referred">Referred</SelectItem>
                        <SelectItem value="died">Died</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="result-condition">Result Condition</Label>
                    <Select value={resultCondition} onValueChange={setResultCondition}>
                      <SelectTrigger id="result-condition">
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="improved">Improved</SelectItem>
                        <SelectItem value="unimproved">Unimproved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={handleDischarge} disabled={isProcessing}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Discharge Patient"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}