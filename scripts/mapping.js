export default Object.freeze({
  Item: {
    name: {
      path: "name",
      converter: "name",
    },
    description: {
      path: "system.description.value",
      converter: "description",
    },
    gm: {
      path: "system.description.gm",
      converter: "description",
    },
    rules: {
      path: "system.rules",
      converter: "rules",
    },
    prerequisites: {
      path: "system.prerequisites.value",
      converter: "prerequisites",
    },
    requirements: "system.requirements",
    range: {
      path: "system.range.value",
      converter: "range",
    },
    target: "system.target.value",
    duration: {
      path: "system.duration.value",
      converter: "duration",
    },
    cost: "system.cost.value",
    time: {
      path: "system.time.value",
      converter: "time",
    },
    heightening: {
      path: "system.heightening.levels",
      converter: "defaultMerge",
    },
    overlays: {
      path: "system.overlays",
      converter: "defaultMerge",
    },
    ritual: {
      path: "system.ritual",
      converter: "defaultMerge",
    },
    badge: {
      path: "system.badge.labels",
      converter: "defaultMerge",
    },
    lore: {
      path: "system.trainedSkills.lore",
      converter: "defaultMerge",
    },
    subitems: {
      path: "system.subitems",
      converter: "embeddedItems",
    },
  },
  Actor: {
    name: {
      path: "name",
      converter: "name",
    },
    blurb: "system.details.blurb",
    publicNotes: "system.details.publicNotes",
    privateNotes: "system.details.privateNotes",
    languages: "system.details.languages.details",
    perception: "system.perception.details",
    description: "system.details.description",
    disable: "system.details.disable",
    reset: "system.details.reset",
    routine: "system.details.routine",
    stealth: "system.attributes.stealth.details",
    hp: "system.attributes.hp.details",
    ac: "system.attributes.ac.details",
    allSaves: "system.attributes.allSaves.value",
    speed: "system.attributes.speed.details",
    di: "system.traits.di.custom",
    melee: "system.weapons.melee.name",
    ranged: "system.weapons.ranged.name",
    crew: "system.details.crew",
    pilotingCheck: "system.details.pilotingCheck",
    speedVehicle: "system.details.speed",
    skills: {
      path: "system.skills",
      converter: "defaultMerge",
    },
    items: {
      path: "items",
      converter: "items",
    },
  },
  JournalEntry: {
    pages: {
      path: "pages",
      converter: "journal",
    },
  },
  RollTable: {
    name: "name",
    description: "description",
    results: {
      path: "results",
      converter: "tableResults",
    },
  },
  Macro: {
    name: "name",
  },
});
