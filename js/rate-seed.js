const RATE_SEED = {
  "schema": 1,
  "quotes": {
    "usd_spb_1": {
      "value": 85.4,
      "source": "https://ligovka.ru/pda/",
      "sourceUpdated": "15 ноября 2026, 16:25",
      "observedAt": 1794770675991,
      "wholesale": 85.3,
      "threshold": 1000,
      "tiers": [
        {
          "min": 0,
          "unit": "receive",
          "currency": "USD",
          "rate": 85.4,
          "label": "розница"
        },
        {
          "min": 1000,
          "unit": "receive",
          "currency": "USD",
          "rate": 85.3,
          "label": "опт"
        },
        {
          "min": 10000,
          "unit": "receive",
          "currency": "USD",
          "rate": 85.3,
          "label": "опт"
        }
      ],
      "oldSeriesSell": 84.6,
      "verification": "official",
      "buy": 83.9
    },
    "eur_spb_1": {
      "value": 94.9,
      "source": "https://ligovka.ru/pda/",
      "sourceUpdated": "15 ноября 2026, 16:25",
      "observedAt": 1794770675991,
      "wholesale": 94.8,
      "threshold": 1000,
      "tiers": [
        {
          "min": 0,
          "unit": "receive",
          "currency": "EUR",
          "rate": 94.9,
          "label": "розница"
        },
        {
          "min": 1000,
          "unit": "receive",
          "currency": "EUR",
          "rate": 94.8,
          "label": "опт"
        },
        {
          "min": 10000,
          "unit": "receive",
          "currency": "EUR",
          "rate": 94.8,
          "label": "опт"
        }
      ],
      "verification": "official",
      "buy": 93.4
    },
    "cny_spb_1": {
      "value": 12.86,
      "source": "https://ligovka.ru/",
      "sourceUpdated": "15 ноября 08:05",
      "observedAt": 1794737627000,
      "wholesale": 12.84,
      "threshold": 10000,
      "tiers": [
        {
          "min": 0,
          "unit": "receive",
          "currency": "CNY",
          "rate": 12.86,
          "label": "розница"
        },
        {
          "min": 10000,
          "unit": "receive",
          "currency": "CNY",
          "rate": 12.84,
          "label": "опт"
        }
      ],
      "verification": "user-snapshot"
    },
    "usd_spb_2": {
      "value": 83.62,
      "source": "https://www.kamkombank.ru/individuals/currency-exchange/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Базовый курс без подбора серии. При включённом режиме USD 2009+ к покупке добавляются наценка и её минимум из полей банка, а также сбор кассы."
    },
    "usd_spb_3": {
      "value": 84.6,
      "source": "https://www.finambank.ru/person_currency/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "buy": 82.8,
      "note": "В расчёте сбор 0 ₽. П. 7.5 регулирует приём банком старых USD и €500, а не продажу новых купюр клиенту; порога суммы для покупки по этому пункту нет. Наличие USD 2009+ уточните в кассе."
    },
    "sbp_fm": {
      "value": 2.722,
      "source": "https://exfm.app/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Снятие в банкомате по QR / курьер. При обмене от 50 000 THB (около 136 100 ₽) действует повышенный индивидуальный курс; его число не опубликовано.",
      "unquotedTier": {
        "min": 50000,
        "unit": "receive",
        "currency": "THB"
      }
    },
    "forex_usd_rub": {
      "value": 82.1516,
      "source": "https://www.cbr.ru/currency_base/daily/?UniDbQuery.Posted=True&UniDbQuery.To=14.11.2026",
      "sourceUpdated": "14.11.2026",
      "observedAt": 1794737627000
    },
    "forex_usd_thb": {
      "value": 33.858936895424705,
      "source": "https://www.cbr.ru/currency_base/daily/?UniDbQuery.Posted=True&UniDbQuery.To=14.11.2026",
      "sourceUpdated": "14.11.2026",
      "observedAt": 1794737627000,
      "note": "Кросс USD/THB: USD/RUB разделён на RUB за 1 THB"
    },
    "sbp_ms": {
      "value": 2.717,
      "source": "https://moneyshopphuket.com/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Выдача в офисе / курьером. По сайту, для получения менее 8 000 ฿ курс отличается; точную котировку подтвердит менеджер.",
      "unquotedBelow": 8000
    },
    "usd_beach": {
      "value": 33.29,
      "source": "https://phuketkit.com/exchange/kata/",
      "sourceUpdated": "15 ноября 10:53",
      "observedAt": 1794737627000,
      "note": "EXFM Карон рядом с Катой; не средний курс всех уличных обменников"
    },
    "usd_vp": {
      "value": 33.78,
      "source": "https://www.valueplusexchange.com/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Курс для купюр $50–100 нового образца по сверке пользователя; для $1–20 ориентир ниже: 33,20–33,40 ฿. Филиал и серию подтвердите перед обменом.",
      "denomination": [
        50,
        100
      ],
      "smallNotes": {
        "denominationRange": [
          1,
          20
        ],
        "rateRange": [
          33.2,
          33.4
        ],
        "verification": "user-snapshot"
      }
    },
    "eur_vp": {
      "value": 37.3,
      "source": "https://www.valueplusexchange.com/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Купюры €100–500; курс филиала уточняется.",
      "denomination": [
        100,
        200,
        500
      ]
    },
    "cny_vp": {
      "value": 5.01,
      "source": "https://www.valueplusexchange.com/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Купюры ¥100; курс филиала уточняется.",
      "denomination": [
        100
      ]
    },
    "usd_ms": {
      "value": 33.513,
      "source": "https://phuketkit.com/exchange/bang-tao/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "note": "Money Shop: котировка сети из Phuket Kit; наличие этого курса в офисе Ката уточняется."
    },
    "eur_spb_3": {
      "value": 94.2,
      "source": "https://www.finambank.ru/person_currency/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "buy": 91.5,
      "note": "В расчёте сбор 0 ₽. П. 7.5 регулирует приём банком старых USD и €500, а не продажу новых купюр клиенту; порога суммы для покупки по этому пункту нет. Наличие USD 2009+ уточните в кассе."
    },
    "cny_spb_3": {
      "value": 13.2,
      "source": "https://www.finambank.ru/person_currency/",
      "observedAt": 1794752117138,
      "sourceUpdated": "15.11.2026 — сверка пользователя, точное время не указано",
      "verification": "user-snapshot",
      "buy": 12.3,
      "note": "В расчёте сбор 0 ₽. П. 7.5 регулирует приём банком старых USD и €500, а не продажу новых купюр клиенту; порога суммы для покупки по этому пункту нет. Наличие USD 2009+ уточните в кассе."
    },
    "fee_spb_1": {
      "value": 20,
      "source": "https://ligovka.ru/",
      "observedAt": 1794752117138,
      "sourceUpdated": "Сбор на официальной странице",
      "verification": "official",
      "note": "20 ₽ за операцию. За приём старой купюры $100 до 2006 г. — 250 ₽; это другая операция.",
      "oldSeriesAcceptanceFee": 250
    },
    "fee_spb_2": {
      "value": 200,
      "source": "https://www.kamkombank.ru/file/filemanag/10ecae5f4913f3bf8187979975de4ed7.pdf",
      "observedAt": 1794752117138,
      "sourceUpdated": "09.09.2026, 4.1 / 4.6",
      "verification": "official",
      "note": "Фиксированный сбор 200 ₽. Наценка за новые $100 учитывается отдельным полем: по условию пользователя 1,50 ₽/$, минимум 200 ₽. Опубликованный тариф размена старых купюр — 1,90 ₽/$; цену выдачи нужной серии подтвердите в офисе.",
      "oldToNewExchange": {
        "rubPerUnit": 1.9,
        "minimumRub": 200
      }
    },
    "fee_spb_3": {
      "value": 0,
      "source": "https://cdn-lpbr01.finam.ru/lpbr-static/Tarify_RKO_FL_a2507d2b94.pdf",
      "observedAt": 1794752117138,
      "sourceUpdated": "Проверен п. 7.5 действующего РКО",
      "verification": "reviewed",
      "note": "В расчёте сбор 0 ₽: опубликованный п. 7.5 относится к приёму старых купюр банком. Отдельный сбор/наценка за продажу новых $100 не подтверждён; 0 — расчётное допущение, уточните в кассе и измените поля при необходимости.",
      "acceptanceFees": [
        {
          "currency": "USD",
          "denominations": [
            50,
            100
          ],
          "seriesMax": 1995,
          "rubPerBanknote": 5000
        },
        {
          "currency": "USD",
          "denominations": [
            100
          ],
          "seriesMin": 1996,
          "seriesMax": 2006,
          "rubPerBanknote": 1500
        },
        {
          "currency": "USD",
          "denominations": [
            50
          ],
          "seriesMax": 2006,
          "except": "NexGen",
          "rubPerBanknote": 1500
        },
        {
          "currency": "EUR",
          "denominations": [
            500
          ],
          "rubPerBanknote": 5000
        }
      ]
    },
    "eur_ms": {
      "value": 37.402,
      "source": "https://phuketkit.com/exchange/eur-thb/",
      "observedAt": 1794752117138,
      "sourceUpdated": "На странице: 6 мин назад; абсолютная дата курса не опубликована",
      "verification": "web-listing",
      "note": "Money Shop: курс сети из Phuket Kit; номинал €100 и офис Ката требуют подтверждения."
    },
    "eur_spb_2": {
      "value": 92.39,
      "buy": 91.21,
      "observedAt": 1795356938504,
      "source": "https://bankiros.ru/bank/kamkombank/currency/eur/spb",
      "sourceUpdated": "22.11.2026 09:15",
      "verification": "web-listing",
      "note": "Ивановская 8/77; справочная котировка Bankiros, подтвердите перед поездкой."
    },
    "cny_spb_2": {
      "value": 12.88,
      "buy": 12.6,
      "source": "https://www-1.banki.ru/products/currency/cash/cny/sankt-peterburg/",
      "sourceUpdated": "На странице дата 22.09.2026; актуальность на сегодня не подтверждена",
      "note": "Офис: Сенная пл., 13. Продажа клиенту («Я покупаю»). Сохранённая котировка 12,88 ₽/¥; не новая онлайн-проверка.",
      "observedAt": 1794761338584,
      "verification": "historical-listing"
    },
    "blue_spb_1": {
      "value": 0,
      "source": "https://ligovka.ru/",
      "observedAt": 1794770675991,
      "verification": "official",
      "sourceUpdated": "Новые USD 2009+ уже в курсе Лиговки",
      "note": "Дополнительной наценки нет: курс USD 2009+."
    },
    "blue_min_spb_1": {
      "value": 0,
      "source": "https://ligovka.ru/",
      "observedAt": 1794770675991,
      "verification": "official",
      "sourceUpdated": "Новые USD 2009+ уже в курсе Лиговки",
      "note": "Дополнительной наценки нет: курс USD 2009+."
    },
    "blue_spb_2": {
      "value": 1.5,
      "source": "https://www.kamkombank.ru/file/filemanag/10ecae5f4913f3bf8187979975de4ed7.pdf",
      "observedAt": 1794770675991,
      "verification": "user-snapshot",
      "sourceUpdated": "Условие расчёта; подтвердите в кассе",
      "note": "Фиксированный сбор 200 ₽. Наценка за новые $100 учитывается отдельным полем: по условию пользователя 1,50 ₽/$, минимум 200 ₽. Опубликованный тариф размена старых купюр — 1,90 ₽/$; цену выдачи нужной серии подтвердите в офисе."
    },
    "blue_min_spb_2": {
      "value": 200,
      "source": "https://www.kamkombank.ru/file/filemanag/10ecae5f4913f3bf8187979975de4ed7.pdf",
      "observedAt": 1794770675991,
      "verification": "user-snapshot",
      "sourceUpdated": "Условие расчёта; подтвердите в кассе",
      "note": "Фиксированный сбор 200 ₽. Наценка за новые $100 учитывается отдельным полем: по условию пользователя 1,50 ₽/$, минимум 200 ₽. Опубликованный тариф размена старых купюр — 1,90 ₽/$; цену выдачи нужной серии подтвердите в офисе."
    },
    "blue_spb_3": {
      "value": 0,
      "source": "https://cdn-lpbr01.finam.ru/lpbr-static/Tarify_RKO_FL_a2507d2b94.pdf",
      "observedAt": 1794770675991,
      "verification": "assumption",
      "sourceUpdated": "Условие расчёта; подтвердите в кассе",
      "note": "В расчёте сбор 0 ₽: опубликованный п. 7.5 относится к приёму старых купюр банком. Отдельный сбор/наценка за продажу новых $100 не подтверждён; 0 — расчётное допущение, уточните в кассе и измените поля при необходимости."
    },
    "blue_min_spb_3": {
      "value": 0,
      "source": "https://cdn-lpbr01.finam.ru/lpbr-static/Tarify_RKO_FL_a2507d2b94.pdf",
      "observedAt": 1794770675991,
      "verification": "assumption",
      "sourceUpdated": "Условие расчёта; подтвердите в кассе",
      "note": "В расчёте сбор 0 ₽: опубликованный п. 7.5 относится к приёму старых купюр банком. Отдельный сбор/наценка за продажу новых $100 не подтверждён; 0 — расчётное допущение, уточните в кассе и измените поля при необходимости."
    },
    "forex_eur_rub": {
      "value": 90.3445,
      "observedAt": 1795356938504,
      "source": "https://bankiros.ru/bank/kamkombank/currency/eur/spb",
      "verification": "web-listing",
      "sourceUpdated": "Курс ЦБ на 22.11.2026 из Bankiros"
    }
  },
  "unresolved": {
    "live": "Динамические таблицы банков и Value Plus не доступны из среды проверки. Часть значений — снимок пользователя; это не новая онлайн-котировка."
  },
  "fees": {
    "fee_spb_1": {
      "value": 20,
      "source": "https://ligovka.ru/",
      "observedAt": 1794752117138,
      "sourceUpdated": "Сбор на официальной странице",
      "verification": "official",
      "note": "20 ₽ за операцию. За приём старой купюры $100 до 2006 г. — 250 ₽; это другая операция.",
      "oldSeriesAcceptanceFee": 250
    },
    "fee_spb_2": {
      "value": 200,
      "source": "https://www.kamkombank.ru/file/filemanag/10ecae5f4913f3bf8187979975de4ed7.pdf",
      "observedAt": 1794752117138,
      "sourceUpdated": "09.09.2026, 4.1 / 4.6",
      "verification": "official",
      "note": "Фиксированный сбор 200 ₽. Наценка за новые $100 учитывается отдельным полем: по условию пользователя 1,50 ₽/$, минимум 200 ₽. Опубликованный тариф размена старых купюр — 1,90 ₽/$; цену выдачи нужной серии подтвердите в офисе.",
      "oldToNewExchange": {
        "rubPerUnit": 1.9,
        "minimumRub": 200
      }
    },
    "fee_spb_3": {
      "value": 0,
      "source": "https://cdn-lpbr01.finam.ru/lpbr-static/Tarify_RKO_FL_a2507d2b94.pdf",
      "observedAt": 1794752117138,
      "sourceUpdated": "Проверен п. 7.5 действующего РКО",
      "verification": "reviewed",
      "note": "В расчёте сбор 0 ₽: опубликованный п. 7.5 относится к приёму старых купюр банком. Отдельный сбор/наценка за продажу новых $100 не подтверждён; 0 — расчётное допущение, уточните в кассе и измените поля при необходимости.",
      "acceptanceFees": [
        {
          "currency": "USD",
          "denominations": [
            50,
            100
          ],
          "seriesMax": 1995,
          "rubPerBanknote": 5000
        },
        {
          "currency": "USD",
          "denominations": [
            100
          ],
          "seriesMin": 1996,
          "seriesMax": 2006,
          "rubPerBanknote": 1500
        },
        {
          "currency": "USD",
          "denominations": [
            50
          ],
          "seriesMax": 2006,
          "except": "NexGen",
          "rubPerBanknote": 1500
        },
        {
          "currency": "EUR",
          "denominations": [
            500
          ],
          "rubPerBanknote": 5000
        }
      ]
    }
  },
  "revision": 2,
  "snapshotDate": "2026-11-15",
  "errors": {},
  "calculationVersion": 10
};
