import type { SubsystemId } from "../sim/types";

export interface Astronaut {
  id: string;
  name: string;
  lifespan: string;
  origin: string;
  /** Verified historical summary */
  bio: string[];
  facts: { label: string; value: string }[];
  /** Fictional gameplay role in ORBYX */
  subsystem: SubsystemId;
  roleTitle: string;
  roleText: string;
  suit: string;
  accent: string;
  visor: string;
}

export const ASTRONAUTS: Astronaut[] = [
  {
    id: "gagarin",
    name: "Yuri Gagarin",
    lifespan: "1934 - 1968",
    origin: "Soviet Union",
    bio: [
      "Soviet Air Force pilot who became the first human in space. On 12 April 1961 his Vostok 1 spacecraft completed one orbit of Earth in about 108 minutes.",
      "He later worked in cosmonaut training and returned to flight duty. He died on 27 March 1968 when the MiG-15UTI jet he was flying crashed during a training flight.",
    ],
    facts: [
      { label: "Historic flight", value: "Vostok 1, 12 April 1961" },
      { label: "First", value: "First human in space" },
      { label: "Time in space", value: "About 108 minutes" },
    ],
    subsystem: "PROP",
    roleTitle: "Propulsion and Launch Engineer",
    roleText:
      "In ORBYX, Gagarin's crew role is fictional: he owns launch vehicle selection, propellant budgets and the rocket equation.",
    suit: "#E8ECF2",
    accent: "#FF6B5A",
    visor: "#1B2A44",
  },
  {
    id: "collins",
    name: "Michael Collins",
    lifespan: "1930 - 2021",
    origin: "United States (born in Rome, Italy)",
    bio: [
      "US Air Force test pilot selected by NASA in 1963. On Gemini 10 in July 1966 he made two spacewalks, and in July 1969 he flew Apollo 11 as command module pilot, orbiting the Moon alone in Columbia while Armstrong and Aldrin landed.",
      "He later directed the Smithsonian's National Air and Space Museum and wrote the memoir Carrying the Fire.",
    ],
    facts: [
      { label: "Missions", value: "Gemini 10, Apollo 11" },
      { label: "Apollo 11 role", value: "Command module pilot" },
      { label: "Later", value: "Director, National Air and Space Museum" },
    ],
    subsystem: "COMMS",
    roleTitle: "Communications Engineer",
    roleText:
      "In ORBYX, Collins's crew role is fictional: he owns radios, antennas, link budgets and data downlink.",
    suit: "#F2EEE6",
    accent: "#B6F36B",
    visor: "#24324D",
  },
  {
    id: "armstrong",
    name: "Neil Armstrong",
    lifespan: "1930 - 2012",
    origin: "United States",
    bio: [
      "Naval aviator and research test pilot who flew the X-15 rocket plane. As command pilot of Gemini 8 in March 1966 he performed the first docking of two spacecraft in orbit.",
      "As commander of Apollo 11 he became the first person to walk on the Moon on 20 July 1969. He later taught aerospace engineering at the University of Cincinnati.",
    ],
    facts: [
      { label: "Missions", value: "Gemini 8, Apollo 11" },
      { label: "First", value: "First person to walk on the Moon" },
      { label: "Background", value: "Aeronautical engineer, test pilot" },
    ],
    subsystem: "GNC",
    roleTitle: "Guidance, Navigation and Control Engineer",
    roleText:
      "In ORBYX, Armstrong's crew role is fictional: he owns orbit design, trajectories, attitude control and landing.",
    suit: "#EEF1F5",
    accent: "#4FC3F7",
    visor: "#18263E",
  },
  {
    id: "aldrin",
    name: "Buzz Aldrin",
    lifespan: "Born 1930",
    origin: "United States",
    bio: [
      "West Point graduate and US Air Force fighter pilot who earned a doctorate in astronautics from MIT in 1963 with a thesis on orbital rendezvous guidance. On Gemini 12 in November 1966 he demonstrated that astronauts could work effectively outside a spacecraft.",
      "As lunar module pilot of Apollo 11 he became the second person to walk on the Moon. He remains an advocate for space exploration.",
    ],
    facts: [
      { label: "Missions", value: "Gemini 12, Apollo 11" },
      { label: "Education", value: "Sc.D. Astronautics, MIT" },
      { label: "Apollo 11 role", value: "Lunar module pilot" },
    ],
    subsystem: "OBDH",
    roleTitle: "On-Board Data Handling Engineer",
    roleText:
      "In ORBYX, Aldrin's crew role is fictional: he owns payload computers, data storage and science instrument integration.",
    suit: "#F0F0EA",
    accent: "#9B7BFF",
    visor: "#202B45",
  },
  {
    id: "tereshkova",
    name: "Valentina Tereshkova",
    lifespan: "Born 1937",
    origin: "Soviet Union",
    bio: [
      "Textile worker and amateur parachutist selected for cosmonaut training in 1962. On Vostok 6, launched 16 June 1963, she became the first woman in space, orbiting Earth 48 times in about three days.",
      "She later graduated from the Zhukovsky Air Force Engineering Academy and went on to a long political career.",
    ],
    facts: [
      { label: "Historic flight", value: "Vostok 6, 16 to 19 June 1963" },
      { label: "First", value: "First woman in space" },
      { label: "Orbits", value: "48" },
    ],
    subsystem: "EPS",
    roleTitle: "Electrical Power Systems Engineer",
    roleText:
      "In ORBYX, Tereshkova's crew role is fictional: she owns solar arrays, batteries and the power budget.",
    suit: "#EDEAF2",
    accent: "#FFB020",
    visor: "#1E2944",
  },
  {
    id: "chawla",
    name: "Kalpana Chawla",
    lifespan: "1962 - 2003",
    origin: "India and United States",
    bio: [
      "Aerospace engineer born in Karnal, India, with degrees from Punjab Engineering College, the University of Texas at Arlington and a PhD from the University of Colorado Boulder. She worked on computational fluid dynamics at NASA Ames before her selection as an astronaut.",
      "She flew on STS-87 in 1997, becoming the first woman of Indian origin in space, and on STS-107. She died with her crewmates when Columbia broke apart during re-entry on 1 February 2003.",
    ],
    facts: [
      { label: "Missions", value: "STS-87, STS-107" },
      { label: "Education", value: "PhD Aerospace Engineering" },
      { label: "First", value: "First woman of Indian origin in space" },
    ],
    subsystem: "THERMAL",
    roleTitle: "Thermal Control Engineer",
    roleText:
      "In ORBYX, Chawla's crew role is fictional: she owns radiators, coatings, heaters and keeping every component in its temperature range.",
    suit: "#F3EEF0",
    accent: "#FF8FB1",
    visor: "#1F2843",
  },
];

export function astronautById(id: string | undefined): Astronaut {
  return ASTRONAUTS.find((a) => a.id === id) ?? ASTRONAUTS[0];
}
