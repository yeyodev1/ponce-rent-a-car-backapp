/**
 * Seed de la plantilla del contrato de alquiler (v1 de ejemplo, ES/EN).
 * Uso: npx ts-node-dev --transpile-only src/scripts/seed-contract.ts
 *      (también corre dentro de `pnpm seed:content`).
 * Idempotente: solo crea la v1 si todavía no existe ninguna plantilla. Nunca
 * pisa versiones que el administrador ya publicó desde el panel.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env";
import { ContractTemplate } from "../models/contractTemplate.model";

const BODY_ES = `Texto de ejemplo: reemplazar por el contrato revisado por su abogado.

Entre {{empresa.nombre}}, con domicilio en {{empresa.direccion}} y teléfono {{empresa.telefono}} (en adelante, "LA ARRENDADORA"), y {{cliente.nombre}}, con documento {{cliente.documento}}, residente en {{cliente.pais}}, correo {{cliente.email}} y teléfono {{cliente.telefono}} (en adelante, "EL ARRENDATARIO"), se celebra el presente contrato de alquiler de vehículo, correspondiente a la reserva {{reserva.codigo}}, al tenor de las siguientes cláusulas:

## PRIMERA. Objeto
LA ARRENDADORA entrega en alquiler a EL ARRENDATARIO un vehículo de la categoría {{vehiculo.categoria}}: marca {{vehiculo.marca}}, modelo {{vehiculo.modelo}}, año {{vehiculo.anio}}, placa {{vehiculo.placa}}, color {{vehiculo.color}}. Si al momento de aceptar este contrato la unidad aún no está asignada, LA ARRENDADORA entregará una unidad de la misma categoría o superior, cuyos datos constarán en el acta de entrega.

## SEGUNDA. Plazo
El alquiler inicia el {{reserva.retiro}} y termina el {{reserva.devolucion}}, por un total de {{reserva.dias}} día(s). Cada día de alquiler equivale a un período de 24 horas contado desde la hora de retiro. Los retrasos en la devolución superiores a una hora se cobrarán como un día adicional, salvo acuerdo escrito con LA ARRENDADORA.

## TERCERA. Entrega y devolución
El vehículo se entrega en: {{reserva.lugarRetiro}}, y se devolverá en: {{reserva.lugarDevolucion}}. Al momento de la entrega y de la devolución se levantará un acta con el kilometraje, el nivel de combustible, el estado exterior e interior y las fotografías del vehículo, que ambas partes aceptan como prueba de su estado. EL ARRENDATARIO devolverá el vehículo en las mismas condiciones en que lo recibió, salvo el desgaste normal por el uso.

## CUARTA. Precio y forma de pago
El valor total del alquiler es de {{reserva.total}}, que incluye la tarifa de la categoría, la cobertura {{reserva.cobertura}} y los extras contratados: {{reserva.extras}}. Los pagos realizados en línea se procesan a través de Payphone; el saldo, de existir, se pagará al momento del retiro.

## QUINTA. Uso permitido
EL ARRENDATARIO se obliga a usar el vehículo de forma responsable, únicamente para transporte particular de personas y equipaje, dentro del territorio de la República del Ecuador. Queda prohibido: subarrendar el vehículo; usarlo para transporte remunerado de pasajeros o carga; participar en competencias; remolcar otros vehículos; circular por vías no aptas; conducir bajo los efectos del alcohol o de sustancias estupefacientes; y salir del país sin autorización escrita de LA ARRENDADORA.

## SEXTA. Conductor autorizado
Solo podrá conducir el vehículo EL ARRENDATARIO, titular de la licencia de conducir N.º {{cliente.licencia}}, vigente hasta el {{cliente.licenciaVence}}, y las personas que LA ARRENDADORA autorice por escrito. Cualquier conductor no autorizado deja sin efecto las coberturas contratadas.

## SÉPTIMA. Kilometraje
Kilometraje contratado: {{reserva.kilometraje}}. Los kilómetros recorridos se calculan con la diferencia entre las actas de entrega y de devolución.

## OCTAVA. Combustible
El vehículo se entrega con un nivel de combustible que consta en el acta de entrega y debe devolverse con el mismo nivel. La diferencia se cobrará al precio vigente del combustible más un cargo por servicio de recarga.

## NOVENA. Garantía (Datafast)
Al momento del retiro, EL ARRENDATARIO autoriza un bloqueo de garantía de {{reserva.garantia}} en su tarjeta de crédito a través de Datafast, u otro medio que acepte LA ARRENDADORA. La garantía no es un cobro: se libera al devolver el vehículo en buen estado y sin valores pendientes. LA ARRENDADORA podrá aplicarla, total o parcialmente, a daños, faltantes de combustible, kilometraje adicional, multas, días extra u otros valores derivados de este contrato, entregando el detalle correspondiente.

## DÉCIMA. Coberturas y exclusiones
La cobertura contratada ({{reserva.cobertura}}) aplica según sus condiciones publicadas. No están cubiertos, entre otros: daños causados por conducción bajo los efectos del alcohol o drogas, por un conductor no autorizado o por uso prohibido; daños en llantas, aros, vidrios, espejos y parte baja del vehículo, salvo que la cobertura lo indique; pérdida de llaves, documentos o accesorios; y objetos personales dejados en el vehículo.

## UNDÉCIMA. Daños y responsabilidad
EL ARRENDATARIO es responsable del vehículo desde su entrega hasta su devolución. En caso de accidente, robo o daño, deberá avisar de inmediato a LA ARRENDADORA y a las autoridades, y no podrá aceptar responsabilidades ni acuerdos con terceros sin autorización. Los daños no cubiertos y los deducibles aplicables correrán por cuenta de EL ARRENDATARIO.

## DUODÉCIMA. Multas e infracciones
Las multas de tránsito, fotomultas, peajes, parqueos y cualquier sanción impuesta durante el plazo del alquiler son de cargo de EL ARRENDATARIO, aun si se notifican después de la devolución. LA ARRENDADORA podrá trasladarle su valor más los costos de gestión.

## DECIMOTERCERA. Cancelación
EL ARRENDATARIO podrá cancelar la reserva comunicándose con LA ARRENDADORA. Las condiciones de reembolso del valor pagado serán las publicadas en el sitio web al momento de la reserva. Si EL ARRENDATARIO no se presenta al retiro sin aviso previo, LA ARRENDADORA podrá disponer de la unidad.

## DECIMOCUARTA. Datos personales
EL ARRENDATARIO autoriza a LA ARRENDADORA a tratar sus datos personales y documentos únicamente para la gestión de esta reserva, la verificación de identidad y el cumplimiento de obligaciones legales, conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.

## DECIMOQUINTA. Ley aplicable y jurisdicción
Este contrato se rige por las leyes de la República del Ecuador. Para cualquier controversia, las partes se someten a los jueces competentes de la ciudad de Guayaquil, sin perjuicio de acudir previamente a la mediación.

## DECIMOSEXTA. Aceptación electrónica
EL ARRENDATARIO declara haber leído íntegramente este contrato y lo acepta de forma electrónica escribiendo su nombre completo y su número de documento. La aceptación registra la fecha, la hora, la dirección IP y una huella digital (SHA-256) del texto aceptado, y tiene la misma validez que una firma manuscrita conforme a la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos del Ecuador.

Guayaquil, {{fecha.hoy}}.`;

const BODY_EN = `Sample text: replace with the agreement reviewed by your lawyer.

Between {{empresa.nombre}}, located at {{empresa.direccion}}, phone {{empresa.telefono}} (hereinafter "THE LESSOR"), and {{cliente.nombre}}, ID {{cliente.documento}}, resident of {{cliente.pais}}, email {{cliente.email}}, phone {{cliente.telefono}} (hereinafter "THE RENTER"), this vehicle rental agreement is entered into for booking {{reserva.codigo}}, under the following clauses:

## FIRST. Purpose
THE LESSOR rents to THE RENTER a vehicle of the {{vehiculo.categoria}} category: make {{vehiculo.marca}}, model {{vehiculo.modelo}}, year {{vehiculo.anio}}, plate {{vehiculo.placa}}, color {{vehiculo.color}}. If the unit has not yet been assigned when this agreement is accepted, THE LESSOR will deliver a unit of the same or a higher category, whose details will be recorded in the delivery report.

## SECOND. Term
The rental starts on {{reserva.retiro}} and ends on {{reserva.devolucion}}, for a total of {{reserva.dias}} day(s). Each rental day is a 24-hour period counted from the pick-up time. Late returns of more than one hour will be charged as an additional day, unless agreed in writing with THE LESSOR.

## THIRD. Delivery and return
The vehicle is delivered at: {{reserva.lugarRetiro}}, and will be returned at: {{reserva.lugarDevolucion}}. At delivery and return, a report will record the mileage, fuel level, exterior and interior condition and photos of the vehicle, which both parties accept as evidence of its condition. THE RENTER will return the vehicle in the same condition in which it was received, except for normal wear and tear.

## FOURTH. Price and payment
The total rental price is {{reserva.total}}, including the category rate, the {{reserva.cobertura}} coverage and the extras booked: {{reserva.extras}}. Online payments are processed through Payphone; any balance will be paid at pick-up.

## FIFTH. Permitted use
THE RENTER agrees to use the vehicle responsibly, only for the private transport of people and luggage, within the Republic of Ecuador. It is forbidden to: sublet the vehicle; use it for paid transport of passengers or cargo; take part in races; tow other vehicles; drive on unsuitable roads; drive under the influence of alcohol or drugs; and leave the country without THE LESSOR's written authorization.

## SIXTH. Authorized driver
Only THE RENTER, holder of driver's license No. {{cliente.licencia}}, valid until {{cliente.licenciaVence}}, and the people THE LESSOR authorizes in writing may drive the vehicle. Any unauthorized driver voids the coverages booked.

## SEVENTH. Mileage
Mileage booked: {{reserva.kilometraje}}. Kilometers driven are calculated from the difference between the delivery and return reports.

## EIGHTH. Fuel
The vehicle is delivered with the fuel level recorded in the delivery report and must be returned with the same level. Any difference will be charged at the current fuel price plus a refueling service fee.

## NINTH. Security deposit (Datafast)
At pick-up, THE RENTER authorizes a security hold of {{reserva.garantia}} on a credit card through Datafast, or another method accepted by THE LESSOR. The hold is not a charge: it is released when the vehicle is returned in good condition with no outstanding amounts. THE LESSOR may apply it, fully or partially, to damages, missing fuel, extra mileage, fines, extra days or other amounts arising from this agreement, providing the corresponding detail.

## TENTH. Coverage and exclusions
The coverage booked ({{reserva.cobertura}}) applies under its published terms. Not covered, among others: damage caused while driving under the influence of alcohol or drugs, by an unauthorized driver or by forbidden use; damage to tires, rims, glass, mirrors and the underbody, unless the coverage says otherwise; loss of keys, documents or accessories; and personal belongings left in the vehicle.

## ELEVENTH. Damage and liability
THE RENTER is responsible for the vehicle from delivery until return. In case of accident, theft or damage, THE RENTER must immediately notify THE LESSOR and the authorities, and may not accept liability or settle with third parties without authorization. Uncovered damage and applicable deductibles will be borne by THE RENTER.

## TWELFTH. Fines and violations
Traffic fines, speed-camera tickets, tolls, parking and any penalty incurred during the rental are borne by THE RENTER, even if notified after the return. THE LESSOR may pass on their amount plus handling costs.

## THIRTEENTH. Cancellation
THE RENTER may cancel the booking by contacting THE LESSOR. Refund conditions are those published on the website at the time of booking. If THE RENTER does not show up for pick-up without prior notice, THE LESSOR may dispose of the unit.

## FOURTEENTH. Personal data
THE RENTER authorizes THE LESSOR to process their personal data and documents only to manage this booking, verify identity and comply with legal obligations, under Ecuador's Organic Law on Personal Data Protection.

## FIFTEENTH. Governing law and jurisdiction
This agreement is governed by the laws of the Republic of Ecuador. For any dispute, the parties submit to the competent judges of the city of Guayaquil, without prejudice to prior mediation.

## SIXTEENTH. Electronic acceptance
THE RENTER declares having read this entire agreement and accepts it electronically by typing their full name and ID number. The acceptance records the date, time, IP address and a digital fingerprint (SHA-256) of the accepted text, and has the same validity as a handwritten signature under Ecuador's Electronic Commerce, Electronic Signatures and Data Messages Law.

Guayaquil, {{fecha.hoy}}.`;

export const CONTRACT_V1 = {
  title: { es: "Contrato de alquiler de vehículo", en: "Vehicle rental agreement" },
  body: { es: BODY_ES, en: BODY_EN },
};

/** Crea la v1 solo si no hay ninguna plantilla. Devuelve true si la creó. */
export async function seedContractTemplate(): Promise<boolean> {
  if (await ContractTemplate.exists({})) return false;
  try {
    await ContractTemplate.create({
      version: 1,
      ...CONTRACT_V1,
      isActive: true,
      createdBy: { id: "", name: "Seed (texto de ejemplo)", email: "" },
    });
    return true;
  } catch (error: any) {
    // Otro proceso la creó al mismo tiempo: el índice único de version lo detecta.
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function main() {
  await mongoose.connect(env.DB_URI);
  const created = await seedContractTemplate();
  console.log(created ? "✔ Plantilla de contrato v1 creada" : "✔ Ya había plantilla de contrato: no se tocó");
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("✖ Falló el seed del contrato:", error);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}
