# Database audit — 2026-09-18

Captured at 2026-09-18T08:03:30.545Z (timezone Asia/Bangkok). [Current baseline](./current-db-baseline-2026-09-18.json) contains row counts, all 17 table hashes, protected order hashes, current stock and 17 matching local/remote migration versions. The 2026-09-16 baseline remains untouched.

The earlier ingredients MD5 is fully explained by the admin category change to ingredient 11 and deletion of ingredient 4. The earlier usage MD5 `3430fd542875fdda0ccb4cfb74350bf8` cannot be reproduced because there is no row-level snapshot for that interval. No evidence of corrupt data or incomplete TEST cleanup was found. This baseline records the current verified state; it does not claim the old usage hash matches. Preserve all current rows and stock.

The archived row-level snapshot used for this comparison matches `docs/current-db-baseline-2026-09-16.json`.
Latest Browser test registry stores hashes only; before = after for all 17 tables. Current changes since that hash reconstruct exactly to order #105 for ingredients and usage.

## Ingredients: 2026-09-16 baseline → current

| ID | name | stock_quantity | minimum_stock | unit | category_id | updated_at |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | กุ้ง → กุ้ง | 1000 → 1000 | 200 → 200 | กรัม → กรัม | 10 → 1 | 2026-09-01T12:23:20.603+00:00 → 2026-09-17T00:32:27.069+00:00 |
| 1 | เนื้อไก่ → เนื้อไก่ | 1270 → 1170 | 400 → 400 | กรัม → กรัม | 1 → 1 | 2026-09-15T04:47:58.465277+00:00 → 2026-09-15T04:47:58.465277+00:00 |
| 3 | ใบกะเพรา → ใบกะเพรา | 270 → 250 | 30 → 30 | กรัม → กรัม | 2 → 2 | 2026-09-15T04:47:58.465277+00:00 → 2026-09-15T04:47:58.465277+00:00 |
| 8 | ไข่ไก่ → ไข่ไก่ | 28 → 27 | 5 → 5 | ฟอง → ฟอง | 4 → 4 | 2026-09-15T04:47:58.465277+00:00 → 2026-09-15T04:47:58.465277+00:00 |
| 20 | ข้าวสวย → ข้าวสวย | 4700 → 4400 | 1000 → 1000 | กรัม → กรัม | 3 → 3 | 2026-09-15T03:34:54.005+00:00 → 2026-09-15T03:34:54.005+00:00 |
| 22 | เนื้อวัว → เนื้อวัว | 700 → 500 | 200 → 200 | กรัม → กรัม | 1 → 1 | 2026-09-15T03:36:07.943+00:00 → 2026-09-15T03:36:07.943+00:00 |
| 4 | ข้าวสาร → DELETED | 8500 → DELETED | 1000 → DELETED | กรัม → DELETED | 3 → DELETED | 2026-09-15T04:47:58.465277+00:00 → DELETED |

## Historical usage rows changed by ingredient ID 4 deletion

All 41 rows retain `quantity_used`, `created_at`, and ingredient snapshots. Only `ingredient_id` changed to null through FK `ON DELETE SET NULL`. The usage table has no `updated_at`; deletion event time is shown.

| usage ID | order_id | order # | status | stock_deducted | ingredient_id | quantity_used | created_at UTC | change event UTC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 50a9c0ce-8015-4c4b-be20-1e55c9f3da09 | 22 | completed | true | 4 → null | 250 | 2026-08-10T16:13:53.902995+00:00 | 2026-09-17T00:32:47.977911Z |
| 5 | 0399d5f1-bd4c-46f6-9fcb-17d561d17659 | 23 | completed | true | 4 → null | 250 | 2026-08-10T16:30:23.733801+00:00 | 2026-09-17T00:32:47.977911Z |
| 8 | ea18b67f-df7d-4764-806b-d097dfdd9831 | 24 | completed | true | 4 → null | 250 | 2026-08-10T16:33:15.466987+00:00 | 2026-09-17T00:32:47.977911Z |
| 12 | d8561762-f490-4767-a553-8756630299fe | 25 | completed | true | 4 → null | 250 | 2026-08-11T07:19:07.711456+00:00 | 2026-09-17T00:32:47.977911Z |
| 17 | bbb75977-b5fe-450f-b933-83bcf2672f87 | 26 | completed | true | 4 → null | 250 | 2026-08-11T07:20:14.041537+00:00 | 2026-09-17T00:32:47.977911Z |
| 19 | 008da0b8-d040-40d1-9050-82102ac4dea1 | 27 | completed | true | 4 → null | 250 | 2026-08-11T13:10:51.470612+00:00 | 2026-09-17T00:32:47.977911Z |
| 22 | d38aca57-687b-43cf-b99d-08043b9de2ad | 28 | completed | true | 4 → null | 250 | 2026-08-11T13:11:48.336807+00:00 | 2026-09-17T00:32:47.977911Z |
| 26 | a5a4c731-0b56-4f6e-a938-d04c19cc2de3 | 29 | cancelled | false | 4 → null | 250 | 2026-08-27T03:42:54.696716+00:00 | 2026-09-17T00:32:47.977911Z |
| 30 | 9bae3899-e0af-4ca7-8e16-34ff43495535 | 30 | cancelled | false | 4 → null | 250 | 2026-08-27T03:56:53.617248+00:00 | 2026-09-17T00:32:47.977911Z |
| 33 | 4ade6131-129e-4142-ba6d-308f3612e64e | 31 | completed | true | 4 → null | 250 | 2026-08-27T04:25:06.379041+00:00 | 2026-09-17T00:32:47.977911Z |
| 36 | d038e4f6-a4a4-4aa5-9749-4415f9a36849 | 32 | completed | true | 4 → null | 250 | 2026-08-27T04:25:50.448994+00:00 | 2026-09-17T00:32:47.977911Z |
| 38 | 0b6aae6d-b470-4d88-9543-81cda94e1ed2 | 33 | completed | true | 4 → null | 250 | 2026-08-27T04:36:34.816292+00:00 | 2026-09-17T00:32:47.977911Z |
| 41 | 0728c792-7908-489d-b199-0806d1fb3abc | 34 | completed | true | 4 → null | 250 | 2026-08-27T04:37:07.889565+00:00 | 2026-09-17T00:32:47.977911Z |
| 44 | d0c61e61-a360-4ab0-9c52-708a781c08fe | 35 | completed | true | 4 → null | 250 | 2026-08-27T08:50:03.873974+00:00 | 2026-09-17T00:32:47.977911Z |
| 47 | 13f2078c-ddc9-4ab1-b12b-2c0a627597bd | 36 | completed | true | 4 → null | 250 | 2026-08-27T08:50:26.524794+00:00 | 2026-09-17T00:32:47.977911Z |
| 51 | 2a3b7d67-3350-4fbe-b253-bbc4ad446657 | 37 | completed | true | 4 → null | 250 | 2026-08-27T08:58:24.207981+00:00 | 2026-09-17T00:32:47.977911Z |
| 56 | 872a31ed-9cd6-4b1e-8bc4-9ec94fae2d6b | 38 | completed | true | 4 → null | 250 | 2026-08-29T13:26:29.233173+00:00 | 2026-09-17T00:32:47.977911Z |
| 58 | 6de70c7e-5c2a-4b2b-9a5a-6b81489dfda2 | 39 | completed | true | 4 → null | 250 | 2026-09-01T06:27:01.868415+00:00 | 2026-09-17T00:32:47.977911Z |
| 60 | 57b66c26-8fcf-4c7e-b694-5f9388ccdc9b | 40 | cancelled | false | 4 → null | 250 | 2026-09-01T06:38:53.437741+00:00 | 2026-09-17T00:32:47.977911Z |
| 62 | a12807c7-3efc-400a-999b-8c5edc58a6e9 | 41 | completed | true | 4 → null | 250 | 2026-09-01T06:39:49.533964+00:00 | 2026-09-17T00:32:47.977911Z |
| 64 | eeaa9f30-545e-4f39-b393-c9bac83c5938 | 42 | completed | true | 4 → null | 250 | 2026-09-01T07:02:23.730226+00:00 | 2026-09-17T00:32:47.977911Z |
| 67 | 71a3de7e-803a-4eeb-99b9-dbd5491385d4 | 43 | completed | true | 4 → null | 250 | 2026-09-01T07:11:39.348051+00:00 | 2026-09-17T00:32:47.977911Z |
| 69 | 3d5e9079-7f70-4368-b511-556b11ade685 | 44 | cancelled | false | 4 → null | 250 | 2026-09-01T07:20:48.593275+00:00 | 2026-09-17T00:32:47.977911Z |
| 71 | f557964f-c1c6-44ff-8b03-222e251df8c1 | 45 | completed | true | 4 → null | 250 | 2026-09-01T07:21:49.051737+00:00 | 2026-09-17T00:32:47.977911Z |
| 73 | 8af132d1-17d3-4ed7-b020-10515a85b1ec | 46 | completed | true | 4 → null | 250 | 2026-09-01T11:03:56.138357+00:00 | 2026-09-17T00:32:47.977911Z |
| 75 | 057691f5-b7b1-4e0c-a5c8-85f7410b4422 | 47 | completed | true | 4 → null | 250 | 2026-09-01T11:19:35.471052+00:00 | 2026-09-17T00:32:47.977911Z |
| 77 | 0e004c3a-9584-4968-94d6-95d18828fd64 | 48 | completed | true | 4 → null | 250 | 2026-09-01T11:19:57.018622+00:00 | 2026-09-17T00:32:47.977911Z |
| 79 | b46d664b-6ffd-47b3-b3f0-b8fb5c57ba45 | 51 | cancelled | false | 4 → null | 250 | 2026-09-02T15:46:36.915823+00:00 | 2026-09-17T00:32:47.977911Z |
| 82 | eac95107-84d4-4d5e-9844-588b624990d5 | 52 | cancelled | false | 4 → null | 250 | 2026-09-02T15:51:42.105071+00:00 | 2026-09-17T00:32:47.977911Z |
| 87 | 7a2c9df7-47ad-47ef-a08e-24ea10f04a4d | 53 | cancelled | false | 4 → null | 250 | 2026-09-02T16:12:57.690941+00:00 | 2026-09-17T00:32:47.977911Z |
| 88 | 38065167-faf7-4afc-bf90-a20314145471 | 54 | cancelled | false | 4 → null | 250 | 2026-09-02T16:12:58.607024+00:00 | 2026-09-17T00:32:47.977911Z |
| 90 | 58fb4cef-55d5-4a16-bcf2-f71f6813fa74 | 55 | cancelled | false | 4 → null | 250 | 2026-09-02T16:12:59.443772+00:00 | 2026-09-17T00:32:47.977911Z |
| 92 | ec4895ca-9c7b-4fb7-b50d-e74ed10df1a9 | 56 | cancelled | false | 4 → null | 250 | 2026-09-02T16:13:00.319113+00:00 | 2026-09-17T00:32:47.977911Z |
| 94 | 1461ca04-1a12-41e1-bd80-9c3af777debf | 57 | cancelled | false | 4 → null | 250 | 2026-09-02T16:17:51.818154+00:00 | 2026-09-17T00:32:47.977911Z |
| 96 | 62a2bd9a-fd74-40dc-b41f-d51aa0e81761 | 58 | cancelled | false | 4 → null | 250 | 2026-09-02T16:24:45.191282+00:00 | 2026-09-17T00:32:47.977911Z |
| 98 | e3989bcf-3362-4d67-8852-010ed723ec9a | 59 | completed | true | 4 → null | 250 | 2026-09-02T16:25:24.97432+00:00 | 2026-09-17T00:32:47.977911Z |
| 102 | 5bbbae15-2861-417c-abdc-11ffdb236402 | 60 | completed | true | 4 → null | 250 | 2026-09-09T13:56:52.264409+00:00 | 2026-09-17T00:32:47.977911Z |
| 105 | e3eb20fa-d369-49ca-9895-baab51ff7520 | 61 | completed | true | 4 → null | 500 | 2026-09-09T13:58:46.599393+00:00 | 2026-09-17T00:32:47.977911Z |
| 119 | a05d94d1-6cd2-4176-b1d9-c0398806f4bd | 68 | completed | true | 4 → null | 250 | 2026-09-10T04:09:44.647637+00:00 | 2026-09-17T00:32:47.977911Z |
| 123 | 06703748-45ef-4dd1-8fa8-d284c27753ae | 69 | completed | true | 4 → null | 250 | 2026-09-10T07:25:57.688934+00:00 | 2026-09-17T00:32:47.977911Z |
| 127 | 51cb1917-844a-4ecc-b4be-b1dd5c396db6 | 70 | cancelled | false | 4 → null | 250 | 2026-09-10T07:31:32.081767+00:00 | 2026-09-17T00:32:47.977911Z |

## New usage rows since 2026-09-16 baseline

| usage ID | order_id | order # | status | stock_deducted | ingredient_id | quantity_used | created_at UTC | returned |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 213 | a12c705e-af0c-4cb7-910a-7e4e83f3e04c | 105 | completed | true | 1 | 100 | 2026-09-17T01:02:46.39743+00:00 | not returned |
| 214 | a12c705e-af0c-4cb7-910a-7e4e83f3e04c | 105 | completed | true | 3 | 20 | 2026-09-17T01:02:46.39743+00:00 | not returned |
| 215 | a12c705e-af0c-4cb7-910a-7e4e83f3e04c | 105 | completed | true | 8 | 1 | 2026-09-17T01:02:46.39743+00:00 | not returned |
| 216 | a12c705e-af0c-4cb7-910a-7e4e83f3e04c | 105 | completed | true | 20 | 300 | 2026-09-17T01:02:46.39743+00:00 | not returned |
| 217 | a12c705e-af0c-4cb7-910a-7e4e83f3e04c | 105 | completed | true | 22 | 200 | 2026-09-17T01:02:46.39743+00:00 | not returned |

No usage rows were removed. Order #105 is table 1, non-TEST, completed, and has a paid cash payment. The effective recipe equals usage: chicken 100, basil 20, egg 1, cooked rice 300, beef 200. These five stock amounts equal baseline minus current. No return occurred.

Orders #94/#95: order, items, options and usage each compare byte-for-byte equal to the 2026-09-16 row snapshot; both remain completed and stock_deducted=true.

Full-table fingerprint during audit: 17/17 equal at start and end, and equal across both audit passes. Historical previous-round SQL MD5 for usage (`3430fd...`) cannot be reconstructed exactly from available row snapshots; latest Browser fingerprint can be reconstructed exactly by excluding #105.
