/**
 * Seed de contenido: SEO de todas las páginas, FAQs, guías de viaje, hoteles
 * aliados (de muestra) y promociones de ejemplo.
 * Uso: pnpm seed:content
 *
 * Idempotente: upsert por key/slug y FAQs por topic + question.es. Volver a
 * correrlo actualiza los textos sin duplicar. Todo queda editable en el admin.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Faq, Guide, Hotel, Promotion, SeoPage } from "../models/content.model";

type T = { es: string; en: string };
const t = (es: string, en: string): T => ({ es, en });
const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

/* ------------------------------------------------------------------ */
/* SEO                                                                 */
/* ------------------------------------------------------------------ */

const seoPages: { key: string; canonical: string; title: T; description: T; h1: T; intro: T }[] = [
  {
    key: "home",
    canonical: "/",
    title: t("Alquiler de autos en Guayaquil | Ponce's Rent a Car", "Car Rental in Guayaquil, Ecuador | Ponce's Rent a Car"),
    description: t(
      "Renta de carros en Guayaquil con entrega en el aeropuerto. SUV, sedanes y camionetas. Te ayudamos a elegir por WhatsApp o reserva en línea.",
      "Car rental in Guayaquil with airport delivery. SUVs, sedans and pickups. Get help choosing on WhatsApp or book online in minutes.",
    ),
    h1: t("Alquiler de autos en Guayaquil, sin complicaciones", "Car rental in Guayaquil, made simple"),
    intro: t(
      "Somos una rentadora local de Guayaquil. Te ayudamos a elegir el vehículo que de verdad necesitas y te lo entregamos en el aeropuerto, tu hotel o donde lo acordemos.",
      "We're a local rental company in Guayaquil. We help you pick the vehicle you actually need and deliver it at the airport, your hotel or wherever we agree.",
    ),
  },
  {
    key: "fleet",
    canonical: "/vehiculos",
    title: t("Vehículos de alquiler en Guayaquil | Ponce's", "Rental Vehicles in Guayaquil | Ponce's Rent a Car"),
    description: t(
      "Conoce nuestras categorías: autos económicos, sedanes, SUV y camionetas para rentar en Guayaquil. Precio por día claro y cobertura incluida.",
      "Browse our categories: economy cars, sedans, SUVs and pickups for rent in Guayaquil. Clear daily price and coverage included.",
    ),
    h1: t("Elige tu vehículo por lo que necesitas", "Choose your vehicle by what you need"),
    intro: t(
      "Aquí eliges por necesidad, no por marca: espacio, comodidad o ahorro. Cada categoría muestra pasajeros, maletas y el precio por día.",
      "Here you choose by need, not by brand: space, comfort or savings. Each category shows passengers, luggage and the daily price.",
    ),
  },
  {
    key: "airport",
    canonical: "/alquiler-autos-aeropuerto-guayaquil",
    title: t("Renta de carros en el aeropuerto de Guayaquil", "Guayaquil Airport Car Rental | Ponce's Rent a Car"),
    description: t(
      "Recibe tu auto en el aeropuerto José Joaquín de Olmedo de Guayaquil. Coordinamos la entrega con tu vuelo. Reserva en línea o por WhatsApp.",
      "Pick up your car at José Joaquín de Olmedo Airport in Guayaquil. We coordinate delivery with your flight. Book online or via WhatsApp.",
    ),
    h1: t("Tu auto te espera en el aeropuerto de Guayaquil", "Your car is waiting at Guayaquil Airport"),
    intro: t(
      "Aterrizas, te encontramos en el aeropuerto José Joaquín de Olmedo y sales manejando. Solo necesitamos tu número de vuelo y la hora aproximada de llegada.",
      "You land, we meet you at José Joaquín de Olmedo Airport and you drive off. We only need your flight number and approximate arrival time.",
    ),
  },
  {
    key: "business",
    canonical: "/empresas",
    title: t("Alquiler de vehículos para empresas en Guayaquil", "Corporate Car Rental in Guayaquil | Ponce's"),
    description: t(
      "Renta de autos y camionetas para empresas en Guayaquil: contratos por días, semanas o meses, facturación y atención directa con un asesor.",
      "Car and pickup rental for companies in Guayaquil: daily, weekly or monthly contracts, invoicing and direct support from an advisor.",
    ),
    h1: t("Vehículos para tu empresa, con un asesor dedicado", "Vehicles for your company, with a dedicated advisor"),
    intro: t(
      "Movilidad para tu equipo sin comprar flota. Cuéntanos cuántos vehículos necesitas y por cuánto tiempo, y te preparamos una propuesta a la medida.",
      "Mobility for your team without buying a fleet. Tell us how many vehicles you need and for how long, and we'll prepare a tailored proposal.",
    ),
  },
  {
    key: "promotions",
    canonical: "/promociones",
    title: t("Promociones de alquiler de autos en Guayaquil", "Car Rental Deals in Guayaquil | Ponce's"),
    description: t(
      "Descuentos vigentes para rentar auto en Guayaquil: semanas completas, entrega en aeropuerto y más. Revisa las condiciones de cada promoción.",
      "Current deals to rent a car in Guayaquil: full weeks, airport delivery and more. Check the conditions of each promotion.",
    ),
    h1: t("Promociones vigentes", "Current deals"),
    intro: t(
      "Ofertas reales y con condiciones claras. Si tienes dudas sobre cuál te conviene, escríbenos y te ayudamos a elegir.",
      "Real deals with clear conditions. If you're not sure which one suits you, message us and we'll help you choose.",
    ),
  },
  {
    key: "hotels",
    canonical: "/hoteles-aliados",
    title: t("Hoteles aliados en Guayaquil | Ponce's Rent a Car", "Partner Hotels in Guayaquil | Ponce's Rent a Car"),
    description: t(
      "Hospédate en hoteles aliados de Guayaquil y recibe tu auto de alquiler en la puerta, con beneficios para huéspedes.",
      "Stay at partner hotels in Guayaquil and get your rental car delivered at the door, with perks for guests.",
    ),
    h1: t("Hoteles aliados: tu auto llega a la puerta", "Partner hotels: your car arrives at the door"),
    intro: t(
      "Si te hospedas en uno de nuestros hoteles aliados, coordinamos la entrega y la devolución del vehículo directamente en el hotel.",
      "If you're staying at one of our partner hotels, we coordinate vehicle delivery and return right at the hotel.",
    ),
  },
  {
    key: "guides",
    canonical: "/guias-de-viaje",
    title: t("Guías de viaje en auto desde Guayaquil", "Road Trip Guides from Guayaquil | Ponce's"),
    description: t(
      "Rutas en auto desde Guayaquil: Salinas, Montañita, Cuenca por El Cajas, la Ruta del Spondylus y escapadas cercanas. Distancias y consejos.",
      "Road trips from Guayaquil: Salinas, Montañita, Cuenca via El Cajas, the Spondylus Route and nearby getaways. Distances and tips.",
    ),
    h1: t("Guías para viajar en auto desde Guayaquil", "Road trip guides from Guayaquil"),
    intro: t(
      "Rutas probadas, tiempos aproximados y consejos prácticos para que disfrutes el camino tanto como el destino.",
      "Tried-and-tested routes, approximate times and practical tips so you enjoy the drive as much as the destination.",
    ),
  },
  {
    key: "faq",
    canonical: "/preguntas-frecuentes",
    title: t("Preguntas frecuentes sobre alquiler de autos", "Car Rental FAQ | Ponce's Rent a Car Guayaquil"),
    description: t(
      "Garantía, kilometraje, licencia, combustible, cobertura y pagos: resolvemos tus dudas antes de rentar un auto en Guayaquil.",
      "Deposit, mileage, license, fuel, coverage and payments: we answer your questions before you rent a car in Guayaquil.",
    ),
    h1: t("Preguntas frecuentes", "Frequently asked questions"),
    intro: t(
      "Lo que más nos preguntan, explicado sin letra pequeña. Si tu duda no está aquí, escríbenos por WhatsApp.",
      "What people ask us most, explained without fine print. If your question isn't here, message us on WhatsApp.",
    ),
  },
  {
    key: "partner",
    canonical: "/socio-sobre-ruedas",
    title: t("Socio sobre Ruedas: renta tu auto con Ponce's", "Partner on Wheels: Rent Out Your Car | Ponce's"),
    description: t(
      "¿Tienes un vehículo en Guayaquil? Súmalo a Ponce's Rent a Car y genera ingresos. Envía tus datos y fotos; lo revisamos contigo.",
      "Own a vehicle in Guayaquil? Add it to Ponce's Rent a Car and earn income. Send your details and photos; we'll review it with you.",
    ),
    h1: t("Convierte tu auto en un socio sobre ruedas", "Turn your car into a partner on wheels"),
    intro: t(
      "Envíanos los datos de tu vehículo y unas fotos. Un asesor revisa la solicitud y te explica cómo funciona antes de cualquier compromiso.",
      "Send us your vehicle details and a few photos. An advisor reviews the request and explains how it works before any commitment.",
    ),
  },
  {
    key: "renaissance",
    canonical: "/ponces-renaissance",
    title: t("Ponce's Renaissance: club de clientes", "Ponce's Renaissance: Customer Club"),
    description: t(
      "El club de clientes de Ponce's Rent a Car: beneficios para quienes rentan con nosotros más de una vez. Déjanos tus datos y te avisamos.",
      "Ponce's Rent a Car customer club: perks for people who rent with us more than once. Leave your details and we'll keep you posted.",
    ),
    h1: t("Ponce's Renaissance", "Ponce's Renaissance"),
    intro: t(
      "Un club pensado para clientes frecuentes. Unirte es opcional y nunca es requisito para reservar.",
      "A club designed for returning customers. Joining is optional and never required to book.",
    ),
  },
  {
    key: "contact",
    canonical: "/contacto",
    title: t("Contacto | Ponce's Rent a Car Guayaquil", "Contact | Ponce's Rent a Car Guayaquil"),
    description: t(
      "Escríbenos por WhatsApp, llámanos o déjanos tus datos y te contactamos. Alquiler de autos en Guayaquil con atención directa.",
      "Message us on WhatsApp, call us or leave your details and we'll get back to you. Car rental in Guayaquil with direct support.",
    ),
    h1: t("Hablemos", "Let's talk"),
    intro: t(
      "La forma más rápida es WhatsApp. Si prefieres, déjanos tu número y un asesor te llama.",
      "The fastest way is WhatsApp. If you prefer, leave your number and an advisor will call you.",
    ),
  },
  {
    key: "landing-guayaquil",
    canonical: "/alquiler-autos-guayaquil",
    title: t("Alquiler de autos en Guayaquil desde el primer día", "Rent a Car in Guayaquil | Ponce's Rent a Car"),
    description: t(
      "Renta un auto en Guayaquil por días o semanas. Entrega en aeropuerto, hotel o domicilio. Cobertura incluida y atención por WhatsApp.",
      "Rent a car in Guayaquil by the day or week. Delivery at the airport, hotel or home. Coverage included and WhatsApp support.",
    ),
    h1: t("Alquiler de autos en Guayaquil", "Car rental in Guayaquil"),
    intro: t(
      "Muévete por Guayaquil y sus alrededores a tu ritmo: Samborondón, la Vía a la Costa o una escapada a la playa. Te entregamos el auto donde lo necesites.",
      "Get around Guayaquil and beyond at your own pace: Samborondón, the coast road or a beach getaway. We deliver the car where you need it.",
    ),
  },
  {
    key: "landing-suv",
    canonical: "/alquiler-suv-guayaquil",
    title: t("Alquiler de SUV en Guayaquil | Ponce's Rent a Car", "SUV Rental in Guayaquil | Ponce's Rent a Car"),
    description: t(
      "Renta una SUV en Guayaquil: más espacio para la familia y el equipaje, ideal para la costa o la Sierra. Reserva en línea o por WhatsApp.",
      "Rent an SUV in Guayaquil: more room for family and luggage, ideal for the coast or the Andes. Book online or via WhatsApp.",
    ),
    h1: t("SUV en alquiler en Guayaquil", "SUV rental in Guayaquil"),
    intro: t(
      "Espacio, altura y comodidad para viajes en familia o rutas largas como Cuenca por El Cajas o la Ruta del Spondylus.",
      "Space, ride height and comfort for family trips or long routes like Cuenca via El Cajas or the Spondylus Route.",
    ),
  },
  {
    key: "landing-trucks",
    canonical: "/alquiler-camionetas-guayaquil",
    title: t("Alquiler de camionetas en Guayaquil", "Pickup Truck Rental in Guayaquil | Ponce's"),
    description: t(
      "Renta camionetas en Guayaquil para trabajo, obra o viajes fuera de la ciudad. Por días, semanas o meses, con atención directa.",
      "Rent pickup trucks in Guayaquil for work, job sites or trips outside the city. By the day, week or month, with direct support.",
    ),
    h1: t("Camionetas en alquiler en Guayaquil", "Pickup truck rental in Guayaquil"),
    intro: t(
      "Para cargar, llegar a obra o salir de la ciudad por caminos exigentes. Cuéntanos el uso y te recomendamos la opción adecuada.",
      "For hauling, reaching job sites or leaving the city on demanding roads. Tell us how you'll use it and we'll recommend the right option.",
    ),
  },
  {
    key: "landing-long-term",
    canonical: "/alquiler-autos-larga-duracion-guayaquil",
    title: t("Alquiler de autos por meses en Guayaquil", "Long-Term Car Rental in Guayaquil | Ponce's"),
    description: t(
      "Renta de autos de larga duración en Guayaquil: un mes o más con tarifa preferencial, mantenimiento incluido y un asesor a cargo.",
      "Long-term car rental in Guayaquil: a month or more with a preferential rate, maintenance included and a dedicated advisor.",
    ),
    h1: t("Alquiler de larga duración en Guayaquil", "Long-term car rental in Guayaquil"),
    intro: t(
      "Si necesitas un auto por un mes o más, te armamos una propuesta a la medida. Sin comprar, sin preocuparte por el mantenimiento.",
      "If you need a car for a month or longer, we'll put together a tailored proposal. No buying, no worrying about maintenance.",
    ),
  },
];

/* ------------------------------------------------------------------ */
/* FAQs (2 por tema)                                                   */
/* ------------------------------------------------------------------ */

const faqs: { topic: string; question: T; answer: T }[] = [
  {
    topic: "guarantee",
    question: t("¿Tengo que dejar una garantía?", "Do I need to leave a security deposit?"),
    answer: t(
      "Sí. Al retirar el vehículo se registra una garantía con tarjeta a través de Datafast. No se cobra en línea al reservar: se hace en persona al momento de la entrega. El monto se indica al reservar.",
      "Yes. When you pick up the vehicle, a card guarantee is registered through Datafast. It's not charged online when you book: it's done in person at delivery. The amount is shown when you book.",
    ),
  },
  {
    topic: "guarantee",
    question: t("¿Cuándo se libera la garantía?", "When is the deposit released?"),
    answer: t(
      "Una vez devuelto el vehículo y revisado su estado, se libera la garantía. El tiempo en que se refleja en tu estado de cuenta depende de tu banco.",
      "Once the vehicle is returned and checked, the guarantee is released. How long it takes to show on your statement depends on your bank.",
    ),
  },
  {
    topic: "mileage",
    question: t("¿El alquiler tiene kilometraje limitado?", "Is mileage limited?"),
    answer: t(
      "Puedes elegir entre kilometraje limitado (incluye una cantidad de km por día) o kilometraje ilimitado por un valor adicional diario. Al cotizar ves exactamente qué incluye cada opción.",
      "You can choose limited mileage (a set number of km per day included) or unlimited mileage for an extra daily fee. When you get a quote you see exactly what each option includes.",
    ),
  },
  {
    topic: "mileage",
    question: t("¿Qué pasa si me paso de los kilómetros incluidos?", "What if I go over the included kilometers?"),
    answer: t(
      "Se cobra cada kilómetro adicional con la tarifa que aparece en tu cotización. Si vas a hacer un viaje largo, te conviene el kilometraje ilimitado: pregúntanos y te ayudamos a calcular.",
      "Each extra kilometer is charged at the rate shown in your quote. If you're planning a long trip, unlimited mileage is usually better: ask us and we'll help you do the math.",
    ),
  },
  {
    topic: "license",
    question: t("¿Qué licencia necesito para rentar?", "What driver's license do I need?"),
    answer: t(
      "Una licencia de conducir vigente. Si eres ecuatoriano, tu licencia nacional y tu cédula. Te pediremos una foto de ambos documentos para verificar la reserva.",
      "A valid driver's license. Ecuadorian residents need their national license and ID card. We'll ask for a photo of both documents to verify your booking.",
    ),
  },
  {
    topic: "license",
    question: t("Soy extranjero, ¿puedo rentar con mi licencia?", "I'm a foreigner, can I rent with my license?"),
    answer: t(
      "Sí. Necesitas tu pasaporte y la licencia vigente de tu país. Si tienes dudas sobre tu caso, escríbenos antes de viajar y lo revisamos contigo.",
      "Yes. You need your passport and a valid license from your home country. If you have questions about your case, message us before you travel and we'll review it with you.",
    ),
  },
  {
    topic: "age",
    question: t("¿Cuál es la edad mínima para rentar?", "What is the minimum age to rent?"),
    answer: t(
      "El conductor debe ser mayor de edad y contar con licencia vigente. Según la categoría del vehículo pueden aplicar requisitos adicionales; te los confirmamos al reservar.",
      "The driver must be of legal age and hold a valid license. Depending on the vehicle category, additional requirements may apply; we'll confirm them when you book.",
    ),
  },
  {
    topic: "age",
    question: t("¿Puede manejar un conductor joven o con licencia reciente?", "Can a young or newly licensed driver rent?"),
    answer: t(
      "Depende del vehículo y de las condiciones de la cobertura. Escríbenos con la edad y los años de licencia del conductor y te decimos qué opciones tienes.",
      "It depends on the vehicle and the coverage conditions. Message us with the driver's age and years licensed and we'll tell you your options.",
    ),
  },
  {
    topic: "fuel",
    question: t("¿Cómo funciona el combustible?", "How does fuel work?"),
    answer: t(
      "El vehículo se entrega con un nivel de combustible y se devuelve con el mismo nivel. Lo registramos juntos en la entrega para que no haya sorpresas.",
      "The vehicle is delivered with a certain fuel level and must be returned with the same level. We record it together at delivery so there are no surprises.",
    ),
  },
  {
    topic: "fuel",
    question: t("¿Qué pasa si lo devuelvo con menos combustible?", "What if I return it with less fuel?"),
    answer: t(
      "Se cobra la diferencia de combustible según las condiciones de tu contrato. Lo más económico siempre es llenarlo tú antes de devolverlo.",
      "The fuel difference is charged according to your rental agreement. The cheapest option is always to refuel it yourself before returning.",
    ),
  },
  {
    topic: "coverage",
    question: t("¿Qué cobertura incluye el alquiler?", "What coverage is included?"),
    answer: t(
      "Todo alquiler incluye la cobertura estándar. También puedes elegir la cobertura preferencial, que reduce lo que pagarías en caso de un incidente. En la página de reserva ves qué incluye y qué NO incluye cada una.",
      "Every rental includes standard coverage. You can also choose preferential coverage, which reduces what you'd pay in case of an incident. On the booking page you can see what each one does and does NOT include.",
    ),
  },
  {
    topic: "coverage",
    question: t("¿Hay exclusiones en la cobertura?", "Are there coverage exclusions?"),
    answer: t(
      "Sí, como en cualquier cobertura. Por ejemplo, suelen quedar fuera los daños por mal uso o por manejar bajo efectos del alcohol. Las exclusiones se muestran completas antes de pagar: preferimos que las conozcas desde el inicio.",
      "Yes, as with any coverage. For example, damage from misuse or driving under the influence is usually excluded. Exclusions are shown in full before you pay: we'd rather you know them upfront.",
    ),
  },
  {
    topic: "damage",
    question: t("¿Qué hago si el auto sufre un daño?", "What should I do if the car gets damaged?"),
    answer: t(
      "Mantén la calma, ponte a salvo y escríbenos de inmediato por WhatsApp con fotos. Te guiamos paso a paso. No hagas reparaciones por tu cuenta sin avisarnos.",
      "Stay calm, get to a safe place and message us right away on WhatsApp with photos. We'll guide you step by step. Don't make repairs on your own without telling us.",
    ),
  },
  {
    topic: "damage",
    question: t("¿Cómo se revisa el estado del vehículo?", "How is the vehicle's condition checked?"),
    answer: t(
      "En la entrega revisamos el vehículo contigo y registramos su estado con fotos. En la devolución se compara con ese registro. Así ambos estamos protegidos.",
      "At delivery we inspect the vehicle with you and record its condition with photos. At return it's compared with that record. That way we're both protected.",
    ),
  },
  {
    topic: "cancellation",
    question: t("¿Puedo cancelar mi reserva?", "Can I cancel my booking?"),
    answer: t(
      "Sí. Las condiciones de cancelación y reembolso dependen de la reserva y se muestran antes de pagar. Escríbenos por WhatsApp con tu código de reserva y te ayudamos.",
      "Yes. Cancellation and refund conditions depend on the booking and are shown before you pay. Message us on WhatsApp with your booking code and we'll help.",
    ),
  },
  {
    topic: "cancellation",
    question: t("¿Puedo cambiar las fechas?", "Can I change the dates?"),
    answer: t(
      "Normalmente sí, sujeto a disponibilidad. Avísanos lo antes posible y te confirmamos si el cambio modifica el precio.",
      "Usually yes, subject to availability. Let us know as soon as possible and we'll confirm whether the change affects the price.",
    ),
  },
  {
    topic: "airport",
    question: t("¿Entregan el auto en el aeropuerto de Guayaquil?", "Do you deliver at Guayaquil Airport?"),
    answer: t(
      "Sí, entregamos en el aeropuerto José Joaquín de Olmedo. Al reservar indica tu número de vuelo y la hora aproximada de llegada para coordinar la entrega.",
      "Yes, we deliver at José Joaquín de Olmedo Airport. When booking, share your flight number and approximate arrival time so we can coordinate the handover.",
    ),
  },
  {
    topic: "airport",
    question: t("¿Qué pasa si mi vuelo se retrasa?", "What if my flight is delayed?"),
    answer: t(
      "Escríbenos por WhatsApp apenas lo sepas. Con tu número de vuelo podemos seguir la llegada y reprogramar la entrega.",
      "Message us on WhatsApp as soon as you know. With your flight number we can track the arrival and reschedule the handover.",
    ),
  },
  {
    topic: "payments",
    question: t("¿Cómo pago mi reserva?", "How do I pay for my booking?"),
    answer: t(
      "En línea con tarjeta a través de PayPhone, de forma segura. Puedes separar tu reserva con un anticipo o pagar el total, según prefieras.",
      "Online by card through PayPhone, securely. You can secure your booking with a deposit or pay the full amount, as you prefer.",
    ),
  },
  {
    topic: "payments",
    question: t("Si pago un anticipo, ¿cuándo pago el resto?", "If I pay a deposit, when do I pay the rest?"),
    answer: t(
      "El saldo se paga antes o al momento de la entrega del vehículo. En tu reserva siempre puedes ver cuánto has pagado y cuánto falta.",
      "The balance is paid before or at vehicle delivery. Your booking always shows how much you've paid and what's left.",
    ),
  },
  {
    topic: "return",
    question: t("¿Dónde y cómo devuelvo el vehículo?", "Where and how do I return the vehicle?"),
    answer: t(
      "En el lugar y la hora acordados en tu reserva. Revisamos el vehículo contigo, confirmamos el combustible y el kilometraje, y listo.",
      "At the place and time agreed in your booking. We check the vehicle with you, confirm fuel and mileage, and you're done.",
    ),
  },
  {
    topic: "return",
    question: t("¿Qué pasa si devuelvo el auto tarde?", "What if I return the car late?"),
    answer: t(
      "Avísanos con anticipación si necesitas más tiempo: muchas veces se puede extender. Los retrasos sin aviso pueden generar cargos según las condiciones de tu contrato.",
      "Let us know in advance if you need more time: it can often be extended. Unannounced delays may incur charges according to your rental agreement.",
    ),
  },
  {
    topic: "driver",
    question: t("¿Puedo agregar un conductor adicional?", "Can I add an additional driver?"),
    answer: t(
      "Sí. El conductor adicional debe cumplir los mismos requisitos (licencia vigente y documento de identidad) y quedar registrado antes de manejar.",
      "Yes. The additional driver must meet the same requirements (valid license and ID) and be registered before driving.",
    ),
  },
  {
    topic: "driver",
    question: t("¿Puede manejar alguien que no está registrado?", "Can someone who isn't registered drive?"),
    answer: t(
      "No. Solo pueden manejar los conductores registrados en el contrato; de lo contrario la cobertura podría no aplicar. Registrar a otro conductor es sencillo: pídelo por WhatsApp.",
      "No. Only drivers registered on the agreement may drive; otherwise coverage may not apply. Adding another driver is easy: just ask on WhatsApp.",
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Guías de viaje                                                      */
/* ------------------------------------------------------------------ */

const guides = [
  {
    slug: "guayaquil-salinas-en-auto",
    destination: "Salinas",
    distanceKm: 140,
    driveTime: "2 h",
    readingMinutes: 5,
    cover: img("1507525428034-b723cf961d3e"),
    title: t("De Guayaquil a Salinas en auto: la escapada de playa clásica", "Guayaquil to Salinas by car: the classic beach getaway"),
    excerpt: t(
      "Unos 140 km por la Vía a la Costa para llegar a la playa más conocida de Santa Elena. Ruta, paradas y consejos para disfrutarla.",
      "About 140 km along the coast road to Santa Elena's best-known beach. Route, stops and tips to enjoy it.",
    ),
    sections: [
      {
        heading: t("La ruta", "The route"),
        body: t(
          "Sales de Guayaquil por la Vía a la Costa hacia Progreso y Santa Elena, y de ahí a Salinas. Son alrededor de 140 km, unas 2 horas sin tráfico. Es una carretera amplia y en buen estado, ideal si es tu primera vez manejando en Ecuador.",
          "Leave Guayaquil on the coast road (Vía a la Costa) toward Progreso and Santa Elena, then on to Salinas. It's about 140 km, roughly 2 hours without traffic. It's a wide, well-kept highway, ideal if it's your first time driving in Ecuador.",
        ),
      },
      {
        heading: t("Qué hacer al llegar", "What to do when you arrive"),
        body: t(
          "Camina por el malecón de Salinas, visita La Chocolatera, el punto más occidental de la península, y busca los lobos marinos en la zona. Entre junio y septiembre es temporada de ballenas jorobadas y salen tours desde la costa.",
          "Stroll Salinas' boardwalk, visit La Chocolatera, the westernmost point of the peninsula, and look for sea lions in the area. From June to September it's humpback whale season, with tours leaving from the coast.",
        ),
      },
      {
        heading: t("Consejos para el viaje", "Trip tips"),
        body: t(
          "Los fines de semana largos y feriados el regreso a Guayaquil se congestiona: sal temprano o después del almuerzo tardío. Lleva agua, protector solar y efectivo para parqueaderos y comida local.",
          "On long weekends and holidays the drive back to Guayaquil gets congested: leave early or after a late lunch. Bring water, sunscreen and cash for parking and local food.",
        ),
      },
      {
        heading: t("Qué auto te conviene", "Which car suits you"),
        body: t(
          "Para esta ruta basta un auto económico o un sedán. Si viajan en familia con equipaje de playa, una SUV les dará más espacio y comodidad.",
          "An economy car or sedan is enough for this route. If you're traveling as a family with beach gear, an SUV will give you more room and comfort.",
        ),
      },
    ],
  },
  {
    slug: "guayaquil-cuenca-por-el-cajas",
    destination: "Cuenca",
    distanceKm: 195,
    driveTime: "3 h 30 min – 4 h",
    readingMinutes: 6,
    cover: img("1470071459604-3b5ec3a7fe05"),
    title: t("Guayaquil–Cuenca por El Cajas: de la costa al páramo", "Guayaquil to Cuenca via El Cajas: from the coast to the páramo"),
    excerpt: t(
      "Unos 195 km en los que subes del nivel del mar a casi 4.000 metros, atravesando el Parque Nacional Cajas. Una de las rutas más lindas del país.",
      "About 195 km climbing from sea level to nearly 4,000 meters through Cajas National Park. One of the most beautiful drives in the country.",
    ),
    sections: [
      {
        heading: t("La ruta", "The route"),
        body: t(
          "Desde Guayaquil tomas la vía hacia Naranjal y luego la carretera que sube por Molleturo y cruza el Parque Nacional Cajas hasta Cuenca. Son alrededor de 195 km y entre 3 h 30 min y 4 h, según el clima y las paradas.",
          "From Guayaquil take the road toward Naranjal and then the highway that climbs through Molleturo and crosses Cajas National Park into Cuenca. It's about 195 km and 3.5 to 4 hours, depending on weather and stops.",
        ),
      },
      {
        heading: t("El Parque Nacional Cajas", "Cajas National Park"),
        body: t(
          "Un páramo con cientos de lagunas. La Laguna Toreadora, junto a la carretera, tiene centro de visitantes y senderos cortos. En la zona alta, cerca de Tres Cruces, pasas por encima de los 4.000 metros: es normal sentir frío y algo de falta de aire.",
          "A páramo with hundreds of lagoons. Laguna Toreadora, right by the road, has a visitor center and short trails. In the high section near Tres Cruces you pass above 4,000 meters: it's normal to feel cold and a bit short of breath.",
        ),
      },
      {
        heading: t("Manejar con neblina y curvas", "Driving with fog and curves"),
        body: t(
          "La subida tiene muchas curvas y la neblina puede aparecer de golpe. Maneja con luces encendidas, sin prisa y sin adelantar en curva. Lo ideal es salir temprano y cruzar el páramo con luz de día.",
          "The climb is full of curves and fog can roll in suddenly. Drive with headlights on, unhurried, and don't overtake on bends. Ideally leave early and cross the páramo in daylight.",
        ),
      },
      {
        heading: t("Qué llevar y qué auto elegir", "What to pack and which car to choose"),
        body: t(
          "Lleva abrigo y algo de comer: la temperatura baja mucho respecto a Guayaquil. Una SUV da más confianza en la subida y más espacio, aunque un sedán en buen estado también hace la ruta sin problema.",
          "Bring a jacket and snacks: it gets much colder than in Guayaquil. An SUV gives more confidence on the climb and more room, though a well-kept sedan also handles the route fine.",
        ),
      },
    ],
  },
  {
    slug: "guayaquil-montanita-en-auto",
    destination: "Montañita",
    distanceKm: 185,
    driveTime: "2 h 45 min – 3 h",
    readingMinutes: 5,
    cover: img("1502680390469-be75c86b636f"),
    title: t("Guayaquil–Montañita en auto: surf, playa y buen ambiente", "Guayaquil to Montañita by car: surf, beach and good vibes"),
    excerpt: t(
      "Alrededor de 185 km hasta el pueblo surfista más famoso de Ecuador, con playas tranquilas muy cerca para elegir tu plan.",
      "Around 185 km to Ecuador's most famous surf town, with quiet beaches nearby so you can pick your vibe.",
    ),
    sections: [
      {
        heading: t("La ruta", "The route"),
        body: t(
          "Vas por la Vía a la Costa hasta Santa Elena y luego tomas la Ruta del Spondylus hacia el norte, pasando por Ballenita y Ayangue. Son unos 185 km, entre 2 h 45 min y 3 h.",
          "Take the coast road to Santa Elena and then head north on the Spondylus Route, passing Ballenita and Ayangue. It's about 185 km, between 2 h 45 min and 3 h.",
        ),
      },
      {
        heading: t("Qué hacer", "What to do"),
        body: t(
          "Montañita es para surfear, tomar clases si estás empezando y disfrutar la vida nocturna. Si buscas algo más tranquilo, Olón está a pocos minutos al norte, con una playa amplia y ambiente familiar.",
          "Montañita is for surfing, taking lessons if you're a beginner and enjoying the nightlife. For something quieter, Olón is a few minutes north, with a wide beach and a family feel.",
        ),
      },
      {
        heading: t("Consejos", "Tips"),
        body: t(
          "En temporada alta y feriados el pueblo se llena: reserva alojamiento con parqueadero. No dejes objetos a la vista dentro del auto y estaciónalo en lugares vigilados.",
          "In high season and on holidays the town fills up: book accommodation with parking. Don't leave belongings in sight inside the car and park in attended lots.",
        ),
      },
    ],
  },
  {
    slug: "ruta-del-spondylus-costa-ecuatoriana",
    destination: "Ruta del Spondylus",
    distanceKm: 235,
    driveTime: "3 h 30 min – 4 h (sin paradas)",
    readingMinutes: 7,
    cover: img("1519046904884-53103b34b206"),
    title: t("Ruta del Spondylus: la costa ecuatoriana en auto", "The Spondylus Route: Ecuador's coast by car"),
    excerpt: t(
      "Desde Guayaquil hasta Puerto López, unos 235 km de playas, pueblos pesqueros y el Parque Nacional Machalilla. Ideal para 2 a 4 días.",
      "From Guayaquil to Puerto López, about 235 km of beaches, fishing villages and Machalilla National Park. Ideal for 2 to 4 days.",
    ),
    sections: [
      {
        heading: t("Cómo armar la ruta", "How to plan the route"),
        body: t(
          "Sal por la Vía a la Costa hasta Santa Elena y sube por la costa hacia el norte. Hasta Puerto López son unos 235 km, entre 3 h 30 min y 4 h sin paradas. Lo mejor es hacerla en 2 a 4 días, durmiendo en uno o dos pueblos.",
          "Take the coast road to Santa Elena and drive north along the shore. It's about 235 km to Puerto López, 3.5 to 4 hours without stops. Best done over 2 to 4 days, staying in one or two towns.",
        ),
      },
      {
        heading: t("Paradas imperdibles", "Must-see stops"),
        body: t(
          "Ayangue, una bahía de aguas tranquilas para nadar y hacer snorkel; Montañita y Olón para surf y playa; y Puerto López, base para visitar el Parque Nacional Machalilla, la playa Los Frailes y la Isla de la Plata en tour de barco.",
          "Ayangue, a calm bay for swimming and snorkeling; Montañita and Olón for surf and beach; and Puerto López, the base for visiting Machalilla National Park, Los Frailes beach and Isla de la Plata by boat tour.",
        ),
      },
      {
        heading: t("Temporada de ballenas", "Whale season"),
        body: t(
          "Entre junio y septiembre las ballenas jorobadas llegan a la costa ecuatoriana. Desde Puerto López salen tours de avistamiento: reserva con operadores autorizados.",
          "From June to September humpback whales arrive on Ecuador's coast. Whale-watching tours leave from Puerto López: book with licensed operators.",
        ),
      },
      {
        heading: t("Consejos para manejar la costa", "Tips for driving the coast"),
        body: t(
          "Es una vía de dos carriles que atraviesa pueblos: respeta los límites de velocidad y atento a peatones y animales. Evita manejar de noche en tramos sin iluminación y llena el tanque cuando tengas oportunidad. Para varios días conviene el kilometraje ilimitado.",
          "It's a two-lane road through villages: respect speed limits and watch for pedestrians and animals. Avoid driving at night on unlit stretches and fill up when you can. For several days, unlimited mileage is the better choice.",
        ),
      },
    ],
  },
  {
    slug: "escapadas-cerca-de-guayaquil",
    destination: "Cerro Blanco, Puerto El Morro y Playas",
    distanceKm: 100,
    driveTime: "30 min – 1 h 30 min",
    readingMinutes: 5,
    cover: img("1441974231531-c6227db76b6e"),
    title: t("Escapadas cerca de Guayaquil: naturaleza a menos de 2 horas", "Getaways near Guayaquil: nature less than 2 hours away"),
    excerpt: t(
      "Bosque seco, delfines y playa sin ir muy lejos: Cerro Blanco, Puerto El Morro y Playas son planes perfectos para un día.",
      "Dry forest, dolphins and beach without going far: Cerro Blanco, Puerto El Morro and Playas are perfect day trips.",
    ),
    sections: [
      {
        heading: t("Bosque Protector Cerro Blanco", "Cerro Blanco Protected Forest"),
        body: t(
          "A unos 20 km del centro, en la Vía a la Costa (unos 30 minutos). Es bosque seco tropical con senderos guiados y aves; aquí se protege al guacamayo verde, símbolo de Guayaquil. Ve temprano, con zapatos cómodos y repelente.",
          "About 20 km from downtown on the coast road (around 30 minutes). It's tropical dry forest with guided trails and birdlife; it protects the great green macaw, a symbol of Guayaquil. Go early, with comfortable shoes and insect repellent.",
        ),
      },
      {
        heading: t("Puerto El Morro", "Puerto El Morro"),
        body: t(
          "Un pueblo pesquero a alrededor de 1 h 30 min de Guayaquil, dentro de un refugio de vida silvestre de manglares. Desde el muelle salen paseos en lancha para ver delfines nariz de botella y la isla de los pájaros brujos (fragatas).",
          "A fishing village about 1.5 hours from Guayaquil, inside a mangrove wildlife refuge. Boat trips leave from the pier to see bottlenose dolphins and the frigatebird island.",
        ),
      },
      {
        heading: t("Playas (General Villamil)", "Playas (General Villamil)"),
        body: t(
          "La playa más cercana a Guayaquil, a unos 100 km y alrededor de 1 h 30 min. Tiene una playa extensa y comida de mar. Puedes combinarla con Puerto El Morro en el mismo día.",
          "The closest beach to Guayaquil, about 100 km and roughly 1.5 hours away. It has a long beach and seafood. You can combine it with Puerto El Morro on the same day.",
        ),
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Hoteles aliados (MUESTRA) y promociones de ejemplo                  */
/* ------------------------------------------------------------------ */

const SAMPLE_NOTE = "Contenido de muestra: reemplazar por hoteles aliados reales.";

const hotels = [
  {
    slug: "hotel-aliado-ejemplo-samborondon",
    name: "Hotel aliado de ejemplo – Samborondón",
    zone: "Samborondón",
    image: img("1542314831-068cd1dbfeeb"),
    order: 1,
    description: t(
      `${SAMPLE_NOTE} Hotel en la zona de Samborondón, cerca de centros comerciales y restaurantes.`,
      "Sample content: replace with real partner hotels. Hotel in the Samborondón area, close to malls and restaurants.",
    ),
    benefit: t("Entrega y devolución del auto en el hotel.", "Car delivery and return at the hotel."),
    promotion: t("Beneficio de muestra para huéspedes.", "Sample perk for guests."),
  },
  {
    slug: "hotel-aliado-ejemplo-kennedy-norte",
    name: "Hotel aliado de ejemplo – Kennedy / Norte",
    zone: "Kennedy / Norte",
    image: img("1551882547-ff40c63fe5fa"),
    order: 2,
    description: t(
      `${SAMPLE_NOTE} Hotel en el norte de Guayaquil, práctico para viajes de negocios y a pocos minutos del aeropuerto.`,
      "Sample content: replace with real partner hotels. Hotel in northern Guayaquil, convenient for business trips and minutes from the airport.",
    ),
    benefit: t("Entrega y devolución del auto en el hotel.", "Car delivery and return at the hotel."),
    promotion: t("Beneficio de muestra para huéspedes.", "Sample perk for guests."),
  },
  {
    slug: "hotel-aliado-ejemplo-centro-malecon",
    name: "Hotel aliado de ejemplo – Centro / Malecón",
    zone: "Centro / Malecón 2000",
    image: img("1566073771259-6a8506099945"),
    order: 3,
    description: t(
      `${SAMPLE_NOTE} Hotel en el centro, cerca del Malecón 2000 y Las Peñas.`,
      "Sample content: replace with real partner hotels. Downtown hotel near Malecón 2000 and Las Peñas.",
    ),
    benefit: t("Entrega y devolución del auto en el hotel.", "Car delivery and return at the hotel."),
    promotion: t("Beneficio de muestra para huéspedes.", "Sample perk for guests."),
  },
];

const in60Days = () => new Date(Date.now() + 60 * 24 * 3600 * 1000);

const promotions = [
  {
    slug: "semana-completa-7x6",
    order: 1,
    image: img("1469854523086-cc02fe5d8800"),
    title: t("Semana completa: 7 días al precio de 6", "Full week: 7 days for the price of 6"),
    body: t(
      "Renta una semana y el séptimo día va por nuestra cuenta. Ideal para recorrer la costa o la Sierra sin mirar el reloj.",
      "Rent for a week and the seventh day is on us. Perfect for exploring the coast or the Andes without watching the clock.",
    ),
    conditions: t(
      "Aplica para alquileres de 7 días consecutivos o más, sujeto a disponibilidad. No acumulable con otras promociones.",
      "Valid for rentals of 7 consecutive days or more, subject to availability. Cannot be combined with other offers.",
    ),
    badge: t("7x6", "7x6"),
    ctaLabel: t("Reservar ahora", "Book now"),
    ctaUrl: "/reservar",
  },
  {
    slug: "entrega-gratis-aeropuerto",
    order: 2,
    image: img("1436491865332-7a61a109cc05"),
    title: t("Entrega gratis en el aeropuerto", "Free airport delivery"),
    body: t(
      "Te esperamos en el aeropuerto José Joaquín de Olmedo con tu auto listo, sin costo de entrega.",
      "We'll meet you at José Joaquín de Olmedo Airport with your car ready, with no delivery fee.",
    ),
    conditions: t(
      "Aplica para entregas en el aeropuerto de Guayaquil coordinadas con al menos 24 horas de anticipación. Sujeto a disponibilidad.",
      "Valid for deliveries at Guayaquil Airport arranged at least 24 hours in advance. Subject to availability.",
    ),
    badge: t("Aeropuerto", "Airport"),
    ctaLabel: t("Ayúdame a elegir", "Help me choose"),
    ctaUrl: "/ayudame-a-elegir",
  },
];

/* ------------------------------------------------------------------ */

function warnLengths() {
  for (const page of seoPages) {
    for (const lang of ["es", "en"] as const) {
      if (page.title[lang].length > 60) console.warn(`⚠ title ${page.key}.${lang} = ${page.title[lang].length} caracteres`);
      if (page.description[lang].length > 155) {
        console.warn(`⚠ description ${page.key}.${lang} = ${page.description[lang].length} caracteres`);
      }
    }
  }
}

async function main() {
  warnLengths();
  console.log("Conectando a MongoDB...");
  await mongoose.connect(env.DB_URI);

  for (const page of seoPages) {
    await SeoPage.updateOne({ key: page.key }, { $set: { ...page, ogImage: "" } }, { upsert: true });
  }
  console.log(`✔ SEO: ${seoPages.length} páginas`);

  const orderByTopic: Record<string, number> = {};
  for (const faq of faqs) {
    orderByTopic[faq.topic] = (orderByTopic[faq.topic] ?? 0) + 1;
    await Faq.updateOne(
      { topic: faq.topic, "question.es": faq.question.es },
      { $set: { ...faq, order: orderByTopic[faq.topic], isActive: true } },
      { upsert: true },
    );
  }
  console.log(`✔ FAQs: ${faqs.length}`);

  for (const guide of guides) {
    await Guide.updateOne(
      { slug: guide.slug },
      {
        $set: {
          ...guide,
          isPublished: true,
          seo: { title: guide.title, description: guide.excerpt, ogImage: guide.cover },
        },
        $setOnInsert: { publishedAt: new Date() },
      },
      { upsert: true },
    );
  }
  console.log(`✔ Guías: ${guides.length}`);

  for (const hotel of hotels) {
    await Hotel.updateOne({ slug: hotel.slug }, { $set: { ...hotel, isActive: true } }, { upsert: true });
  }
  console.log(`✔ Hoteles (muestra): ${hotels.length}`);

  for (const promo of promotions) {
    await Promotion.updateOne(
      { slug: promo.slug },
      { $set: { ...promo, isActive: true, startsAt: null, endsAt: in60Days() } },
      { upsert: true },
    );
  }
  console.log(`✔ Promociones: ${promotions.length}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("✖ Falló el seed de contenido:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
