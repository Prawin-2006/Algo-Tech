import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const medicalRecordsTable = pgTable("medical_records", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  recordType: text("record_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  prescriptions: text("prescriptions").array().notNull().default([]),
  labResults: jsonb("lab_results"),
  doctorName: text("doctor_name"),
  hospitalName: text("hospital_name"),
  visitDate: text("visit_date"),
  encryptedData: text("encrypted_data"),
  dataHash: text("data_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMedicalRecordSchema = createInsertSchema(medicalRecordsTable).omit({ createdAt: true });
export type InsertMedicalRecord = z.infer<typeof insertMedicalRecordSchema>;
export type MedicalRecord = typeof medicalRecordsTable.$inferSelect;
