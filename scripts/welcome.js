import { MODULE_ID } from "./constants.js";
import { settingsKeys } from "./settings.js";

const WELCOME_DIALOG_ID = `${MODULE_ID}-welcome-dialog`;

export function registerWelcomeWindow() {
  Hooks.once("ready", () => {
    maybeShowWelcomeWindow();
  });
}

export async function maybeShowWelcomeWindow() {
  if (game.i18n.lang !== "uk") return;

  const skipWelcome = game.settings.get(MODULE_ID, settingsKeys.WELCOME_SKIP);
  if (skipWelcome) return;

  showWelcomeWindow();
}

function showWelcomeWindow() {
  const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "";

  new foundry.applications.api.DialogV2({
    id: WELCOME_DIALOG_ID,
    window: {
      title: "Вітаємо в українському перекладі Pathfinder 2e",
      resizable: true,
    },
    position: {
      width: 560,
    },
    content: getWelcomeContent(moduleVersion),
    buttons: [
      {
        action: "close",
        label: "Закрити",
        icon: "fa-solid fa-xmark",
        default: true,
        callback: () => {},
      },
      {
        action: "skip",
        label: "Не показувати знову",
        icon: "fa-solid fa-check",
        callback: async () => {
          await game.settings.set(MODULE_ID, settingsKeys.WELCOME_SKIP, true);
          ui.notifications.info("Вікно вітання більше не буде показуватись.");
        },
      },
    ],
  }).render({ force: true });
}

function getWelcomeContent(moduleVersion) {
  return `
    <section class="pf2e-uk-welcome">
    <h2>Вітаю!</h2>

    <p>
        Дякую, що користуєшся неофіційним українським перекладом Pathfinder 2e.
    </p>

    <p>
        Насамперед цей модуль існує й може поширювати українську мову завдяки надзвичайним людям,
        які боронять нашу країну. Дякуємо всім захисникам і захисницям України!
    </p>

    <p>
        Окрема вдячність людям, які підтримали цю ідею та допомогли їй здійснитися:
        <strong>Eppi, Olena H, Baldo, Vadym</strong>.
    </p>

    <hr>

    <p>
        Модуль усе ще перебуває в розробці та редагуванні, тому ми будемо дуже вдячні
        за повідомлення про баги, неточності або помилки перекладу.
        Якщо ти хочеш долучитися до перекладу, редагування або тестування — будемо раді твоїй допомозі.
        Кожен внесок робить цей проєкт кращим.
    </p>

    <div class="pf2e-uk-welcome__info">
        <p><strong>Версія модуля:</strong> ${moduleVersion || "невідомо"}</p>

        <p>
        Щоб модуль працював, у налаштуваннях Foundry має бути вибрана українська мова:
        <strong>UK / Українська</strong>.
        </p>

        <p>
        Модуль усе ще перекладається, тому якщо ти бачиш англійський текст, це може означати,
        що відповідний запис ще не перекладено.
        Ми будемо вдячні за репорти про баги, помилки перекладу та пропозиції щодо покращення модуля.
        </p>
    </div>

    <p>
        Дякую всім, хто долучився до перекладу, тестування та підтримки проєкту!
    </p>

    <hr>

    <p class="pf2e-uk-welcome__hint">
        Це вікно можна вимкнути кнопкою <strong>“Не показувати знову”</strong>.
        Повернути його можна в налаштуваннях модуля.
    </p>
    </section>
  `;
}
