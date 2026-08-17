import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "./fonts";

/**
 * Server-rendered ultrasound/imaging report PDF (Be Vietnam Pro registered via
 * registerPdfFonts). Images must be downloaded server-side and passed as
 * Buffers — react-pdf cannot reliably fetch a private signed URL at render
 * time in every runtime, so the route handler fetches the bytes first.
 */

export type UltrasoundImage = { data: Buffer; format: "jpg" | "png" };

export type UltrasoundData = {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  title: string;
  patientName: string;
  patientDob: string | null;
  patientAge: number | null;
  patientGender: string | null;
  date: string;
  diagnosis: string | null;
  conclusion: string | null;
  doctorName: string | null;
  images: UltrasoundImage[];
  labels: {
    patient: string;
    date: string;
    dob: string;
    age: string;
    gender: string;
    diagnosis: string;
    conclusion: string;
    doctor: string;
    signature: string;
  };
};

const s = StyleSheet.create({
  page: { fontFamily: "Be Vietnam Pro", fontSize: 10, padding: 36, color: "#111" },
  clinic: { fontSize: 14, fontWeight: "bold" },
  muted: { color: "#555", fontSize: 9 },
  h1: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8, textAlign: "center" },
  meta: { marginBottom: 4 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginTop: 14, marginBottom: 4 },
  sectionBody: { marginBottom: 4 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
  imageCell: { width: "48%" },
  image: { width: "100%", height: 180, objectFit: "contain", borderWidth: 1, borderColor: "#ddd" },
  signatureWrap: { marginTop: 32, flexDirection: "row", justifyContent: "flex-end" },
  signatureBlock: { width: 200, textAlign: "center" },
  signatureDate: { fontSize: 9, marginBottom: 2 },
  signatureRole: { fontWeight: "bold", marginBottom: 40 },
  signatureHint: { fontSize: 8, color: "#555" },
  signatureName: { fontWeight: "bold", marginTop: 4 },
});

export function UltrasoundDocument({ data }: { data: UltrasoundData }) {
  const L = data.labels;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.clinic}>{data.clinicName || "—"}</Text>
        {!!data.clinicAddress && <Text style={s.muted}>{data.clinicAddress}</Text>}
        {!!data.clinicPhone && <Text style={s.muted}>{data.clinicPhone}</Text>}

        <Text style={s.h1}>{data.title}</Text>

        <Text style={s.meta}>
          {L.patient}: {data.patientName}
        </Text>
        <Text style={s.meta}>
          {L.date}: {data.date}
        </Text>
        {(data.patientDob != null || data.patientAge != null) && (
          <Text style={s.meta}>
            {L.dob}: {data.patientDob ?? "—"}
            {data.patientAge != null ? `    ${L.age}: ${data.patientAge}` : ""}
          </Text>
        )}
        {!!data.patientGender && (
          <Text style={s.meta}>
            {L.gender}: {data.patientGender}
          </Text>
        )}

        {!!data.diagnosis && (
          <View>
            <Text style={s.sectionTitle}>{L.diagnosis}</Text>
            <Text style={s.sectionBody}>{data.diagnosis}</Text>
          </View>
        )}
        {!!data.conclusion && (
          <View>
            <Text style={s.sectionTitle}>{L.conclusion}</Text>
            <Text style={s.sectionBody}>{data.conclusion}</Text>
          </View>
        )}

        {data.images.length > 0 && (
          <View style={s.imageGrid}>
            {data.images.map((img, i) => (
              <View key={i} style={s.imageCell}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's <Image>, not an HTML img element */}
                <Image style={s.image} src={{ data: img.data, format: img.format }} />
              </View>
            ))}
          </View>
        )}

        <View style={s.signatureWrap}>
          <View style={s.signatureBlock}>
            <Text style={s.signatureDate}>{data.date}</Text>
            <Text style={s.signatureRole}>{L.doctor}</Text>
            <Text style={s.signatureHint}>{L.signature}</Text>
            <Text style={s.signatureName}>{data.doctorName ?? "—"}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Render the ultrasound report to a PDF Buffer (Node runtime). Registers fonts first. */
export async function renderUltrasoundPdf(data: UltrasoundData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<UltrasoundDocument data={data} />);
}
