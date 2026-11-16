const DemoData = {
  getSampleSchedule() {
    return {
      term: "Semestre Pregrado 2026 - 2",
      importedAt: new Date().toISOString(),
      courses: [
        {
          id: "38338",
          title: "Internet de las Cosas",
          code: "IGR 00140",
          section: "A08",
          nrc: "38338",
          credits: "5,000",
          campus: "IPST Concepción",
          instructor: "JORGE ALEJANDRO BAÑAREZ CONTRERAS",
          color: "#2563eb",
          meetings: [
            { day: 0, startMin: 585, endMin: 625, room: "Prat N° 825-879 S-11-P05-A", type: "Cátedra", instructor: "JORGE ALEJANDRO BAÑAREZ CONTRERAS", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 0, startMin: 626, endMin: 665, room: "Prat N° 825-879 S-11-P05-A", type: "Cátedra", instructor: "JORGE ALEJANDRO BAÑAREZ CONTRERAS", startDate: "2026-08-10", endDate: "2026-12-31" }
          ],
          tbaMeetings: []
        },
        {
          id: "38415",
          title: "Arquitectura de Redes",
          code: "IGR 00165",
          section: "A0A",
          nrc: "38415",
          credits: "5,000",
          campus: "IPST Concepción",
          instructor: "Francisca Rojas",
          color: "#7c3aed",
          meetings: [
            { day: 3, startMin: 536, endMin: 575, room: "CP0002 L-03-P06-A", type: "Laboratorio", instructor: "Francisca Rojas", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 3, startMin: 585, endMin: 625, room: "CP0002 L-03-P06-A", type: "Laboratorio", instructor: "Francisca Rojas", startDate: "2026-08-10", endDate: "2026-12-31" }
          ],
          tbaMeetings: []
        },
        {
          id: "27769",
          title: "Seguridad Informática",
          code: "IGR 00164",
          section: "A03",
          nrc: "27769",
          credits: "4,000",
          campus: "IPST Concepción",
          instructor: "Andrés Villalobos",
          color: "#059669",
          meetings: [
            { day: 2, startMin: 585, endMin: 625, room: "CP0002 L-02-P06-A", type: "Cátedra", instructor: "Andrés Villalobos", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 2, startMin: 626, endMin: 665, room: "CP0002 L-02-P06-A", type: "Cátedra", instructor: "Andrés Villalobos", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 3, startMin: 626, endMin: 665, room: "CP0002 L-02-P06-A", type: "Laboratorio", instructor: "Andrés Villalobos", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 3, startMin: 675, endMin: 715, room: "CP0002 L-02-P06-A", type: "Laboratorio", instructor: "Andrés Villalobos", startDate: "2026-08-10", endDate: "2026-12-31" }
          ],
          tbaMeetings: []
        },
        {
          id: "28603",
          title: "Programación Web",
          code: "IGR 00148",
          section: "0",
          nrc: "28603",
          credits: "5,000",
          campus: "IPST Concepción",
          instructor: "Matías Herrera",
          color: "#d97706",
          meetings: [
            { day: 4, startMin: 536, endMin: 575, room: "CP0002 L-03-P06-A", type: "Taller", instructor: "Matías Herrera", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 4, startMin: 585, endMin: 625, room: "CP0002 L-03-P06-A", type: "Taller", instructor: "Matías Herrera", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 4, startMin: 626, endMin: 665, room: "CP0002 L-03-P06-A", type: "Taller", instructor: "Matías Herrera", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 4, startMin: 675, endMin: 715, room: "CP0002 L-03-P06-A", type: "Taller", instructor: "Matías Herrera", startDate: "2026-08-10", endDate: "2026-12-31" }
          ],
          tbaMeetings: []
        },
        {
          id: "51653",
          title: "Ética Profesional",
          code: "ETC 00004",
          section: "X05",
          nrc: "51653",
          credits: "3,000",
          campus: "IPST Concepción",
          instructor: "Laura Fuentes",
          color: "#db2777",
          meetings: [
            { day: 2, startMin: 1035, endMin: 1075, room: "CP0002 S-06-P04-A", type: "Cátedra", instructor: "Laura Fuentes", startDate: "2026-08-10", endDate: "2026-12-31" },
            { day: 2, startMin: 1076, endMin: 1115, room: "CP0002 S-06-P04-A", type: "Cátedra", instructor: "Laura Fuentes", startDate: "2026-08-10", endDate: "2026-12-31" }
          ],
          tbaMeetings: []
        }
      ]
    };
  }
};
