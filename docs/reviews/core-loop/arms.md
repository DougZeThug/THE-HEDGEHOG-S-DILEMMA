# The nine arms (simulated)

Produced by `scripts/experiment.ts` at commit 7039b58, while each change was still a named experiment, with:

```
ARMS='base;P=passes;R=passes,recoil;AIR=passes,airLine;DEP=passes,departure,kneelAtChair;D=passes,offerOrder;EXIT=passes,departure,exitLine;E=hygiene;ALL=passes,recoil,airLine,kneelAtChair,departure,offerOrder,exitLine,hygiene'
```

The winners have since become how the room behaves, so these names no longer exist in the Director (`Director.EXPERIMENTS` is empty). What each was:
- **base:** the room as it was.
- **passes** (P): an approach counts only when they come to the chair; walking past it doesn't.
- **recoil** (R): the room recoils when they come back to the chair after a stay.
- **airLine** (AIR): "Please don't come any closer." in the air after stepping back from a stay.
- **kneelAtChair** (in DEP): kneeling counts only within 1.5 m of the chair.
- **departure** (DEP): the departure line by how the visit went.
- **offerOrder** (D): a wall offer doesn't spend a pointing; Almost is earned by coming back.
- **exitLine** (EXIT): the way out by the drawn door.
- **hygiene** (E): a seed per visit, situations seeded per visit, the `contribute` signal raised.
- **ALL:** all of the above together.

Columns: "caused" is a perceived development in place within 8 s that isn't the room's own life; the placebo, in brackets, is the same test at moments when nothing was done for 8 s, for the same device.

In "left by the way out: N (of M …)" below, N also counts the early-leaver among the visitors chosen to break things, who isn't among the M; the script now counts N within the M (`after.md`).

8910 visits in 700.9 s (79 ms each). Simulated visitors; reactions are assumptions.

## Is what they do answered, in place, within 8 s? (first visits; caused answers, perceived)

| arm | device | meet: n · caused (placebo) | return: n · caused (placebo) | tap: n · caused (placebo) | turn: n · caused (placebo) | approach: n · caused (placebo) | kneel: n · caused (placebo) | tap-chair: n · caused (placebo) | pause-chair: n · caused (placebo) | withdraw: n · caused (placebo) | pause: n · caused (placebo) | write: n · caused (placebo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | desktop | 11421 · 19% (19%) | 8603 · 30% (19%) | 2075 · 33% (19%) | 19956 · 18% (18%) | 5448 · 15% (8%) | 1353 · 23% (8%) | 0 · — (8%) | 4154 · 16% (8%) | 9021 · 41% (28%) | 8318 · 31% (28%) | 80 · 20% (28%) |
| base | phone | 3546 · 24% (14%) | 2409 · 33% (14%) | 3670 · 31% (14%) | 5531 · 17% (14%) | 1511 · 18% (3%) | 248 · 31% (3%) | 1040 · 16% (3%) | 1197 · 15% (3%) | 2276 · 40% (20%) | 1881 · 28% (20%) | 25 · 36% (20%) |
| P | desktop | 10823 · 20% (17%) | 9208 · 30% (17%) | 2062 · 33% (17%) | 19995 · 17% (17%) | 5455 · 17% (8%) | 1322 · 26% (8%) | 0 · — (8%) | 4161 · 17% (8%) | 4637 · 38% (27%) | 8299 · 30% (27%) | 96 · 25% (27%) |
| P | phone | 3383 · 24% (14%) | 2569 · 32% (14%) | 3651 · 30% (14%) | 5550 · 17% (13%) | 1505 · 18% (5%) | 244 · 29% (5%) | 1029 · 15% (5%) | 1162 · 18% (5%) | 1273 · 40% (22%) | 1884 · 28% (22%) | 24 · 38% (22%) |
| R | desktop | 11027 · 20% (16%) | 9355 · 30% (16%) | 2124 · 31% (16%) | 20378 · 17% (15%) | 5536 · 35% (8%) | 1365 · 35% (8%) | 0 · — (8%) | 3810 · 17% (8%) | 4781 · 42% (26%) | 8454 · 33% (26%) | 85 · 21% (26%) |
| R | phone | 3513 · 24% (11%) | 2603 · 32% (11%) | 3724 · 31% (11%) | 5652 · 17% (10%) | 1556 · 36% (4%) | 226 · 44% (4%) | 1059 · 33% (4%) | 1051 · 17% (4%) | 1306 · 43% (17%) | 1933 · 30% (17%) | 18 · 39% (17%) |
| AIR | desktop | 10836 · 20% (17%) | 9191 · 30% (17%) | 2063 · 33% (17%) | 20001 · 17% (17%) | 5459 · 17% (8%) | 1312 · 26% (8%) | 0 · — (8%) | 4165 · 17% (8%) | 4642 · 40% (27%) | 8294 · 30% (27%) | 98 · 24% (27%) |
| AIR | phone | 3371 · 24% (14%) | 2566 · 32% (14%) | 3615 · 30% (14%) | 5546 · 17% (14%) | 1503 · 18% (5%) | 245 · 29% (5%) | 1036 · 15% (5%) | 1178 · 18% (5%) | 1264 · 43% (22%) | 1879 · 28% (22%) | 22 · 36% (22%) |
| DEP | desktop | 10841 · 20% (17%) | 9182 · 30% (17%) | 2054 · 32% (17%) | 19963 · 17% (17%) | 5473 · 17% (8%) | 1315 · 26% (8%) | 0 · — (8%) | 4180 · 17% (8%) | 4654 · 39% (27%) | 8281 · 30% (27%) | 96 · 25% (27%) |
| DEP | phone | 3383 · 24% (14%) | 2569 · 32% (14%) | 3651 · 30% (14%) | 5550 · 17% (13%) | 1505 · 18% (5%) | 244 · 29% (5%) | 1029 · 15% (5%) | 1162 · 18% (5%) | 1273 · 40% (22%) | 1884 · 28% (22%) | 24 · 38% (22%) |
| D | desktop | 10822 · 20% (17%) | 9185 · 30% (17%) | 2060 · 33% (17%) | 19960 · 17% (17%) | 5446 · 17% (8%) | 1317 · 26% (8%) | 0 · — (8%) | 4153 · 17% (8%) | 4622 · 38% (27%) | 8319 · 30% (27%) | 96 · 24% (27%) |
| D | phone | 3392 · 24% (14%) | 2562 · 32% (14%) | 3659 · 30% (14%) | 5548 · 17% (14%) | 1502 · 18% (5%) | 244 · 28% (5%) | 1028 · 15% (5%) | 1156 · 19% (5%) | 1266 · 40% (22%) | 1895 · 28% (22%) | 24 · 38% (22%) |
| EXIT | desktop | 11038 · 20% (18%) | 9124 · 31% (18%) | 2172 · 37% (18%) | 20042 · 18% (17%) | 5414 · 17% (8%) | 1314 · 26% (8%) | 0 · — (8%) | 4186 · 17% (8%) | 4647 · 39% (27%) | 8228 · 31% (27%) | 96 · 23% (27%) |
| EXIT | phone | 3413 · 24% (14%) | 2456 · 33% (14%) | 3634 · 34% (14%) | 5490 · 17% (13%) | 1505 · 21% (7%) | 242 · 30% (7%) | 1028 · 15% (7%) | 1188 · 20% (7%) | 1270 · 43% (20%) | 1851 · 28% (20%) | 23 · 26% (20%) |
| E | desktop | 11336 · 19% (18%) | 8601 · 29% (18%) | 2008 · 31% (18%) | 20029 · 18% (17%) | 5471 · 14% (7%) | 1373 · 22% (7%) | 0 · — (7%) | 4137 · 15% (7%) | 9027 · 43% (29%) | 8334 · 33% (29%) | 72 · 26% (29%) |
| E | phone | 3573 · 23% (14%) | 2408 · 32% (14%) | 3704 · 29% (14%) | 5537 · 17% (13%) | 1514 · 17% (3%) | 268 · 27% (3%) | 1020 · 16% (3%) | 1161 · 17% (3%) | 2278 · 43% (20%) | 1874 · 31% (20%) | 28 · 39% (20%) |
| ALL | desktop | 11180 · 20% (15%) | 9256 · 31% (15%) | 2125 · 36% (15%) | 20403 · 18% (15%) | 5507 · 36% (8%) | 1318 · 36% (8%) | 0 · — (8%) | 3756 · 17% (8%) | 4764 · 47% (27%) | 8486 · 35% (27%) | 83 · 24% (27%) |
| ALL | phone | 3563 · 25% (14%) | 2516 · 33% (14%) | 3764 · 34% (14%) | 5622 · 18% (13%) | 1566 · 39% (6%) | 239 · 40% (6%) | 1045 · 34% (6%) | 1050 · 18% (6%) | 1302 · 49% (21%) | 1938 · 31% (21%) | 20 · 55% (21%) |

## Arriving at the chair: the first, a return after going away, again (first visits)

| arm | device | first · return · again | answered: first | return | again |
|---|---|---|---|---|---|
| base | desktop | 712 · 4410 · 326 | 34% {"voice":150,"none":468,"memory":5,"sound":77,"silence":12} | 12% {"none":3885,"memory":135,"voice":140,"silence":180,"sound":70} | 10% {"none":292,"silence":11,"voice":10,"memory":8,"sound":5} |
| base | phone | 195 · 1261 · 55 | 37% {"none":122,"sound":15,"voice":54,"memory":2,"silence":2} | 15% {"none":1068,"silence":60,"memory":64,"voice":47,"sound":22} | 20% {"none":44,"silence":1,"voice":5,"sound":2,"memory":3} |
| P | desktop | 711 · 4404 · 340 | 41% {"voice":195,"none":421,"silence":12,"memory":4,"sound":79} | 14% {"none":3805,"memory":152,"voice":200,"silence":171,"sound":76} | 12% {"none":299,"voice":10,"sound":8,"memory":8,"silence":15} |
| P | phone | 195 · 1256 · 54 | 39% {"none":118,"sound":13,"voice":62,"memory":1,"silence":1} | 15% {"none":1069,"silence":55,"memory":49,"voice":63,"sound":20} | 17% {"none":45,"silence":2,"voice":5,"memory":2} |
| R | desktop | 718 · 4523 · 295 | 46% {"voice":162,"none":391,"sound":154,"memory":4,"silence":6,"light":1} | 35% {"none":2926,"light":1285,"silence":94,"sound":47,"voice":72,"memory":99} | 13% {"none":256,"silence":19,"memory":5,"sound":7,"voice":7,"light":1} |
| R | phone | 195 · 1296 · 65 | 42% {"none":114,"sound":31,"voice":48,"memory":1,"silence":1} | 37% {"light":376,"none":817,"memory":44,"voice":25,"silence":23,"sound":11} | 11% {"none":58,"silence":2,"memory":3,"sound":1,"voice":1} |
| AIR | desktop | 711 · 4400 · 348 | 41% {"voice":195,"none":421,"silence":12,"memory":4,"sound":79} | 14% {"none":3802,"memory":150,"voice":199,"silence":170,"sound":78,"text":1} | 13% {"none":302,"text":1,"voice":11,"sound":9,"memory":9,"silence":16} |
| AIR | phone | 195 · 1257 · 51 | 39% {"none":118,"sound":13,"voice":62,"memory":1,"silence":1} | 15% {"none":1069,"silence":50,"memory":47,"voice":66,"sound":25} | 18% {"none":42,"silence":2,"voice":5,"memory":2} |
| DEP | desktop | 711 · 4422 · 340 | 41% {"voice":195,"none":422,"silence":12,"memory":4,"sound":78} | 13% {"none":3831,"memory":145,"voice":194,"silence":173,"sound":79} | 12% {"none":300,"voice":10,"sound":8,"memory":8,"silence":14} |
| DEP | phone | 195 · 1256 · 54 | 39% {"none":118,"sound":13,"voice":62,"memory":1,"silence":1} | 15% {"none":1069,"silence":55,"memory":49,"voice":63,"sound":20} | 17% {"none":45,"silence":2,"voice":5,"memory":2} |
| D | desktop | 711 · 4396 · 339 | 41% {"voice":195,"none":421,"silence":12,"memory":4,"sound":79} | 14% {"none":3796,"memory":152,"voice":199,"silence":171,"sound":78} | 12% {"none":298,"voice":10,"sound":8,"memory":8,"silence":15} |
| D | phone | 195 · 1250 · 57 | 39% {"none":118,"sound":13,"voice":62,"memory":1,"silence":1} | 15% {"none":1062,"silence":55,"memory":49,"voice":63,"sound":21} | 16% {"none":48,"silence":2,"voice":5,"memory":2} |
| EXIT | desktop | 713 · 4371 · 330 | 41% {"voice":196,"none":421,"silence":11,"memory":6,"sound":79} | 14% {"none":3770,"voice":190,"silence":204,"memory":128,"sound":79} | 13% {"none":286,"sound":8,"memory":10,"silence":19,"voice":7} |
| EXIT | phone | 195 · 1263 · 47 | 40% {"none":117,"sound":13,"voice":63,"memory":1,"silence":1} | 18% {"none":1036,"silence":73,"voice":76,"sound":21,"memory":57} | 17% {"none":39,"silence":2,"voice":5,"memory":1} |
| E | desktop | 714 · 4441 · 316 | 34% {"voice":148,"none":473,"sound":78,"memory":5,"silence":10} | 12% {"none":3924,"memory":142,"voice":131,"silence":176,"sound":68} | 8% {"none":290,"silence":10,"voice":8,"memory":6,"sound":2} |
| E | phone | 195 · 1271 · 48 | 39% {"none":119,"sound":18,"voice":54,"memory":2,"silence":2} | 14% {"none":1095,"silence":55,"memory":54,"sound":24,"voice":43} | 13% {"none":42,"silence":1,"voice":3,"memory":1,"sound":1} |
| ALL | desktop | 716 · 4498 · 293 | 48% {"voice":165,"none":375,"sound":162,"silence":10,"memory":2,"light":2} | 36% {"light":1288,"none":2883,"memory":104,"silence":110,"sound":40,"voice":72,"text":1} | 12% {"none":258,"voice":8,"silence":14,"memory":6,"sound":5,"light":2} |
| ALL | phone | 195 · 1305 · 66 | 45% {"none":108,"sound":35,"voice":51,"memory":1} | 39% {"light":367,"none":799,"sound":19,"silence":50,"memory":42,"voice":28} | 17% {"none":55,"memory":3,"silence":3,"voice":5} |

## Restraint and passivity (first visits; medians unless said)

| arm | per min | longest seen gap | voices / visit | imposed quiet (mean) | most own in 20 s (max) | overlaps | same-kind repeats | passive 30 s windows | identical answer to a repeated act |
|---|---|---|---|---|---|---|---|---|---|
| base | 6.8 | 42.7 | 11.0 | 40% | 8 | 0.0 | 3.0 | 21% | 0% of 5348 |
| P | 6.7 | 44.4 | 10.0 | 40% | 8 | 0.0 | 3.0 | 22% | 0% of 5719 |
| R | 6.9 | 44.2 | 11.0 | 40% | 9 | 0.0 | 3.0 | 20% | 9% of 7285 |
| AIR | 6.7 | 44.2 | 10.0 | 40% | 8 | 0.0 | 3.0 | 22% | 0% of 5710 |
| DEP | 6.7 | 44.4 | 10.0 | 41% | 8 | 0.0 | 3.0 | 22% | 0% of 5703 |
| D | 6.7 | 44.9 | 10.0 | 40% | 8 | 0.0 | 3.0 | 22% | 0% of 5720 |
| EXIT | 6.8 | 44.2 | 10.0 | 40% | 9 | 0.0 | 3.0 | 22% | 1% of 5912 |
| E | 6.9 | 42.5 | 11.0 | 40% | 9 | 0.0 | 4.0 | 21% | 0% of 5249 |
| ALL | 7.1 | 44.1 | 10.0 | 40% | 9 | 0.0 | 4.0 | 18% | 10% of 7323 |

## What a visit reaches (first visits)

| arm | class | n | any painted | kitchen light | cereal | woodland | almost | things | bedroom | door | vignettes / visit | "stay" finished (median s) | air | held silence | table | first memory (median s) | offers / visit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | reader | 135 | 49% | 51% | 33% | 5% | 1% | 0% | 13% | 11% | 1.6 | 80% (59.4) | 1% | 100% | 4% | 165.2 | 1.2 |
| base | chair | 135 | 20% | 47% | 7% | 0% | 0% | 0% | 10% | 3% | 1.4 | 88% (30.4) | 7% | 99% | 1% | 222.7 | 1.5 |
| base | explorer | 135 | 57% | 39% | 36% | 5% | 0% | 1% | 17% | 16% | 1.0 | 30% (183.2) | 2% | 99% | 1% | 165.2 | 1.2 |
| base | still | 135 | 36% | 37% | 26% | 1% | 1% | 1% | 9% | 2% | 1.5 | 98% (37.2) | 3% | 99% | 1% | 167.8 | 1.3 |
| base | phone | 135 | 49% | 47% | 44% | 6% | 1% | 0% | 4% | 13% | 1.6 | 78% (34.4) | 4% | 100% | 4% | 152.1 | 1.2 |
| base | mixed | 135 | 43% | 53% | 27% | 3% | 1% | 1% | 10% | 12% | 1.3 | 76% (47.4) | 4% | 100% | 3% | 171.6 | 1.2 |
| base | adversary | 120 | 55% | 27% | 36% | 3% | 1% | 2% | 26% | 16% | 1.4 | 67% (93.6) | 3% | 88% | 2% | 116.3 | 1.5 |
| base | all | 930 | 44% | 43% | 30% | 3% | 1% | 1% | 12% | 10% | 1.4 | 74% (42.6) | 3% | 98% | 2% | 166.5 | 1.3 |
| P | reader | 135 | 48% | 56% | 37% | 6% | 1% | 0% | 7% | 13% | 1.5 | 78% (59.4) | 2% | 100% | 4% | 163.7 | 1.3 |
| P | chair | 135 | 16% | 47% | 7% | 0% | 0% | 0% | 7% | 2% | 1.3 | 89% (30.4) | 10% | 99% | 1% | 184.3 | 1.5 |
| P | explorer | 135 | 47% | 44% | 32% | 4% | 0% | 1% | 10% | 15% | 1.0 | 29% (172.7) | 4% | 99% | 0% | 164.7 | 1.3 |
| P | still | 135 | 40% | 34% | 29% | 1% | 0% | 0% | 12% | 1% | 1.6 | 98% (37.2) | 4% | 99% | 1% | 167.3 | 1.3 |
| P | phone | 135 | 54% | 47% | 43% | 4% | 1% | 0% | 8% | 14% | 1.5 | 81% (46.2) | 7% | 100% | 6% | 157.0 | 1.2 |
| P | mixed | 135 | 41% | 54% | 26% | 5% | 0% | 1% | 7% | 12% | 1.3 | 79% (58.4) | 4% | 100% | 4% | 163.9 | 1.3 |
| P | adversary | 120 | 52% | 27% | 41% | 4% | 3% | 1% | 13% | 20% | 1.4 | 65% (105.2) | 8% | 88% | 1% | 100.4 | 1.6 |
| P | all | 930 | 42% | 44% | 31% | 4% | 1% | 0% | 9% | 11% | 1.4 | 74% (43.5) | 6% | 98% | 2% | 163.7 | 1.3 |
| R | reader | 135 | 50% | 57% | 32% | 2% | 0% | 1% | 10% | 15% | 1.6 | 79% (45.1) | 5% | 100% | 1% | 164.6 | 1.3 |
| R | chair | 135 | 21% | 46% | 8% | 1% | 0% | 0% | 9% | 4% | 1.3 | 85% (29.8) | 18% | 99% | 3% | 196.0 | 1.5 |
| R | explorer | 135 | 39% | 49% | 24% | 4% | 1% | 0% | 7% | 13% | 1.2 | 30% (70.2) | 2% | 99% | 1% | 169.0 | 1.3 |
| R | still | 135 | 36% | 33% | 25% | 1% | 0% | 0% | 9% | 3% | 1.5 | 100% (39.6) | 9% | 100% | 0% | 166.2 | 1.4 |
| R | phone | 135 | 55% | 48% | 46% | 5% | 1% | 0% | 6% | 13% | 1.5 | 78% (22.8) | 4% | 99% | 4% | 151.4 | 1.1 |
| R | mixed | 135 | 42% | 57% | 30% | 6% | 0% | 1% | 5% | 13% | 1.3 | 79% (43.8) | 6% | 100% | 4% | 165.9 | 1.2 |
| R | adversary | 120 | 52% | 24% | 38% | 5% | 1% | 2% | 14% | 13% | 1.5 | 63% (65.8) | 6% | 88% | 0% | 100.4 | 1.6 |
| R | all | 930 | 42% | 45% | 29% | 3% | 0% | 0% | 9% | 11% | 1.4 | 73% (37.2) | 7% | 98% | 2% | 164.7 | 1.3 |
| AIR | reader | 135 | 49% | 53% | 37% | 7% | 1% | 0% | 7% | 13% | 1.5 | 78% (59.4) | 13% | 100% | 4% | 163.3 | 1.3 |
| AIR | chair | 135 | 13% | 47% | 7% | 0% | 0% | 0% | 6% | 2% | 1.3 | 89% (30.4) | 19% | 99% | 1% | 184.6 | 1.5 |
| AIR | explorer | 135 | 47% | 44% | 32% | 3% | 0% | 1% | 10% | 15% | 1.0 | 29% (172.7) | 4% | 99% | 0% | 162.9 | 1.3 |
| AIR | still | 135 | 42% | 34% | 28% | 2% | 0% | 0% | 14% | 1% | 1.6 | 98% (37.2) | 16% | 99% | 1% | 167.8 | 1.3 |
| AIR | phone | 135 | 53% | 45% | 43% | 4% | 1% | 1% | 8% | 13% | 1.5 | 81% (46.2) | 24% | 100% | 6% | 157.0 | 1.2 |
| AIR | mixed | 135 | 44% | 55% | 27% | 6% | 0% | 1% | 8% | 13% | 1.3 | 79% (58.4) | 13% | 100% | 4% | 163.8 | 1.4 |
| AIR | adversary | 120 | 53% | 28% | 41% | 4% | 3% | 1% | 15% | 20% | 1.4 | 65% (105.2) | 9% | 88% | 1% | 100.4 | 1.5 |
| AIR | all | 930 | 43% | 44% | 30% | 4% | 1% | 1% | 10% | 11% | 1.4 | 74% (43.5) | 14% | 98% | 2% | 163.7 | 1.3 |
| DEP | reader | 135 | 48% | 56% | 37% | 6% | 1% | 0% | 7% | 13% | 1.5 | 78% (59.4) | 2% | 100% | 4% | 163.7 | 1.3 |
| DEP | chair | 135 | 16% | 47% | 7% | 0% | 0% | 0% | 7% | 2% | 1.3 | 89% (30.4) | 10% | 99% | 1% | 184.3 | 1.5 |
| DEP | explorer | 135 | 47% | 44% | 32% | 4% | 0% | 1% | 10% | 15% | 1.0 | 29% (172.7) | 4% | 99% | 0% | 164.7 | 1.3 |
| DEP | still | 135 | 40% | 34% | 29% | 1% | 0% | 0% | 12% | 1% | 1.6 | 98% (37.2) | 4% | 99% | 1% | 167.3 | 1.3 |
| DEP | phone | 135 | 54% | 47% | 43% | 4% | 1% | 0% | 8% | 14% | 1.5 | 81% (46.2) | 7% | 100% | 6% | 157.0 | 1.2 |
| DEP | mixed | 135 | 41% | 54% | 26% | 5% | 0% | 1% | 7% | 12% | 1.3 | 79% (58.4) | 4% | 100% | 4% | 163.9 | 1.3 |
| DEP | adversary | 120 | 52% | 26% | 42% | 3% | 2% | 1% | 13% | 19% | 1.5 | 65% (106.2) | 6% | 88% | 1% | 100.4 | 1.5 |
| DEP | all | 930 | 42% | 44% | 31% | 3% | 1% | 0% | 9% | 11% | 1.4 | 74% (43.5) | 5% | 98% | 2% | 163.7 | 1.3 |
| D | reader | 135 | 50% | 56% | 37% | 6% | 4% | 0% | 7% | 13% | 1.5 | 78% (59.4) | 2% | 100% | 4% | 163.7 | 1.3 |
| D | chair | 135 | 18% | 47% | 7% | 0% | 2% | 0% | 7% | 3% | 1.3 | 88% (30.4) | 11% | 99% | 1% | 184.3 | 1.6 |
| D | explorer | 135 | 47% | 44% | 32% | 3% | 1% | 1% | 10% | 14% | 1.0 | 30% (172.7) | 4% | 99% | 0% | 164.7 | 1.4 |
| D | still | 135 | 40% | 34% | 29% | 1% | 1% | 0% | 12% | 1% | 1.6 | 98% (37.2) | 4% | 99% | 1% | 167.3 | 1.4 |
| D | phone | 135 | 55% | 47% | 43% | 2% | 6% | 0% | 8% | 13% | 1.5 | 82% (46.9) | 7% | 100% | 6% | 157.0 | 1.2 |
| D | mixed | 135 | 42% | 54% | 26% | 3% | 7% | 1% | 7% | 10% | 1.3 | 79% (58.4) | 4% | 100% | 4% | 163.9 | 1.4 |
| D | adversary | 120 | 53% | 27% | 41% | 3% | 4% | 2% | 12% | 19% | 1.4 | 64% (105.2) | 6% | 88% | 1% | 100.4 | 1.6 |
| D | all | 930 | 43% | 44% | 31% | 3% | 4% | 1% | 9% | 10% | 1.4 | 74% (43.5) | 5% | 98% | 2% | 163.7 | 1.4 |
| EXIT | reader | 135 | 50% | 51% | 37% | 4% | 1% | 0% | 9% | 13% | 1.5 | 75% (54.5) | 1% | 99% | 1% | 162.4 | 1.2 |
| EXIT | chair | 135 | 19% | 50% | 7% | 0% | 0% | 1% | 7% | 4% | 1.3 | 92% (30.4) | 13% | 99% | 1% | 185.0 | 1.4 |
| EXIT | explorer | 135 | 51% | 40% | 33% | 6% | 0% | 1% | 16% | 11% | 1.1 | 24% (96.5) | 2% | 99% | 0% | 167.4 | 1.3 |
| EXIT | still | 135 | 36% | 35% | 30% | 2% | 1% | 0% | 7% | 3% | 1.5 | 96% (37.0) | 4% | 100% | 1% | 167.3 | 1.4 |
| EXIT | phone | 135 | 58% | 46% | 44% | 13% | 2% | 1% | 13% | 10% | 1.3 | 82% (46.9) | 7% | 100% | 5% | 153.6 | 1.2 |
| EXIT | mixed | 135 | 45% | 51% | 27% | 3% | 0% | 0% | 10% | 14% | 1.3 | 78% (58.4) | 7% | 100% | 3% | 170.3 | 1.2 |
| EXIT | adversary | 120 | 53% | 30% | 41% | 5% | 2% | 2% | 18% | 15% | 1.4 | 61% (99.8) | 3% | 88% | 1% | 100.4 | 1.6 |
| EXIT | all | 930 | 45% | 44% | 31% | 5% | 1% | 1% | 11% | 10% | 1.3 | 73% (41.7) | 5% | 98% | 2% | 167.0 | 1.3 |
| E | reader | 135 | 50% | 52% | 35% | 7% | 0% | 0% | 10% | 12% | 1.6 | 79% (62.5) | 2% | 100% | 1% | 168.5 | 1.3 |
| E | chair | 135 | 18% | 52% | 5% | 1% | 0% | 0% | 11% | 1% | 1.3 | 87% (30.4) | 8% | 99% | 1% | 224.0 | 1.5 |
| E | explorer | 135 | 50% | 45% | 30% | 7% | 0% | 0% | 17% | 12% | 1.0 | 27% (192.8) | 1% | 99% | 1% | 165.8 | 1.2 |
| E | still | 135 | 33% | 35% | 27% | 1% | 0% | 0% | 5% | 3% | 1.5 | 98% (37.8) | 3% | 99% | 1% | 167.7 | 1.4 |
| E | phone | 135 | 52% | 44% | 44% | 8% | 1% | 0% | 6% | 10% | 1.6 | 79% (39.1) | 3% | 100% | 5% | 153.6 | 1.1 |
| E | mixed | 135 | 37% | 54% | 26% | 3% | 0% | 1% | 5% | 7% | 1.3 | 70% (44.4) | 6% | 100% | 1% | 169.2 | 1.2 |
| E | adversary | 120 | 61% | 24% | 37% | 0% | 1% | 1% | 28% | 18% | 1.4 | 65% (66.2) | 5% | 88% | 3% | 124.0 | 1.5 |
| E | all | 930 | 42% | 44% | 29% | 4% | 0% | 0% | 12% | 9% | 1.4 | 72% (40.6) | 4% | 98% | 2% | 167.7 | 1.3 |
| ALL | reader | 135 | 51% | 59% | 30% | 5% | 2% | 1% | 14% | 15% | 1.5 | 77% (54.3) | 8% | 100% | 1% | 168.0 | 1.4 |
| ALL | chair | 135 | 16% | 50% | 7% | 0% | 1% | 0% | 6% | 3% | 1.3 | 90% (30.4) | 23% | 99% | 2% | 190.1 | 1.5 |
| ALL | explorer | 135 | 40% | 41% | 27% | 4% | 2% | 0% | 10% | 13% | 1.1 | 28% (66.3) | 4% | 99% | 1% | 172.0 | 1.4 |
| ALL | still | 135 | 34% | 40% | 26% | 4% | 4% | 0% | 7% | 1% | 1.3 | 98% (39.6) | 12% | 100% | 1% | 172.3 | 1.5 |
| ALL | phone | 135 | 59% | 43% | 47% | 7% | 7% | 0% | 9% | 7% | 1.5 | 78% (22.8) | 13% | 100% | 3% | 130.6 | 1.4 |
| ALL | mixed | 135 | 40% | 53% | 30% | 3% | 6% | 0% | 5% | 6% | 1.2 | 71% (36.8) | 20% | 100% | 2% | 166.0 | 1.3 |
| ALL | adversary | 120 | 57% | 27% | 38% | 6% | 7% | 2% | 17% | 13% | 1.4 | 68% (86.3) | 9% | 88% | 1% | 118.3 | 1.7 |
| ALL | all | 930 | 42% | 45% | 29% | 4% | 4% | 0% | 9% | 8% | 1.3 | 73% (36.7) | 13% | 98% | 2% | 168.7 | 1.5 |

## Situations, phases, leaving (first visits)

**base.** situations {"next-room":876,"humming":769,"residue":426,"erosion":99}; contradiction median 51.5 s, transform 137.9 s (reached 98%); leaving 'close' 78%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 40%): "The chair, from the door." 372, "Somebody almost knocked." 352, "It is still warm where you were." 180, "From over there it looked smaller." 15, "The hum went on for a while after." 5, "Someone was humming." 4, "Nothing moved for a long time." 2
**P.** situations {"next-room":874,"humming":758,"residue":431,"erosion":116}; contradiction median 51.8 s, transform 140.0 s (reached 98%); leaving 'close' 77%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 52%): "It is still warm where you were." 479, "Somebody almost knocked." 212, "The chair, from the door." 192, "The hum went on for a while after." 16, "From over there it looked smaller." 15, "Nothing moved for a long time." 11, "Someone was humming." 5
**R.** situations {"next-room":871,"humming":774,"residue":430,"erosion":97}; contradiction median 51.9 s, transform 136.8 s (reached 98%); leaving 'close' 75%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 41%): "It is still warm where you were." 377, "Somebody almost knocked." 258, "The chair, from the door." 248, "Nothing moved for a long time." 16, "From over there it looked smaller." 15, "The hum went on for a while after." 11, "Someone was humming." 5
**AIR.** situations {"next-room":875,"humming":763,"residue":430,"erosion":117}; contradiction median 51.8 s, transform 139.9 s (reached 98%); leaving 'close' 76%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 51%): "It is still warm where you were." 472, "Somebody almost knocked." 211, "The chair, from the door." 198, "The hum went on for a while after." 17, "From over there it looked smaller." 15, "Nothing moved for a long time." 12, "Someone was humming." 5
**DEP.** situations {"next-room":874,"humming":760,"residue":426,"erosion":116}; contradiction median 51.9 s, transform 140.3 s (reached 98%); leaving 'close' 65%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 65%): "It is still warm where you were." 609, "Somebody came back for the umbrella." 235, "Somebody almost knocked." 56, "From over there it looked smaller." 23, "The light stays on." 7
**D.** situations {"next-room":874,"humming":758,"residue":431,"erosion":116}; contradiction median 51.8 s, transform 140.0 s (reached 98%); leaving 'close' 77%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 52%): "It is still warm where you were." 482, "Somebody almost knocked." 210, "The chair, from the door." 192, "From over there it looked smaller." 15, "The hum went on for a while after." 14, "Nothing moved for a long time." 12, "Someone was humming." 5
**EXIT.** situations {"next-room":876,"humming":773,"erosion":117,"residue":427}; contradiction median 51.8 s, transform 139.7 s (reached 98%); leaving 'close' 66%; left by the way out: 42 (of 225 who went to the door to leave), unintended 2, let-go begun 307
  departure lines (largest share 62%): "It is still warm where you were." 580, "Somebody came back for the umbrella." 213, "Somebody almost knocked." 71, "The chair, from the door." 42, "From over there it looked smaller." 21, "The light stays on." 3
**E.** situations {"next-room":849,"humming":588,"listening":552,"residue":271,"erosion":94}; contradiction median 51.5 s, transform 138.2 s (reached 98%); leaving 'close' 78%; left by the way out: 0 (of 225 who went to the door to leave), unintended 0, let-go begun 0
  departure lines (largest share 41%): "The chair, from the door." 379, "Somebody almost knocked." 359, "It is still warm where you were." 160, "From over there it looked smaller." 15, "The hum went on for a while after." 8, "Someone was humming." 5, "Nothing moved for a long time." 4
**ALL.** situations {"next-room":851,"listening":559,"humming":569,"residue":249,"erosion":101}; contradiction median 51.9 s, transform 138.3 s (reached 98%); leaving 'close' 63%; left by the way out: 42 (of 225 who went to the door to leave), unintended 1, let-go begun 294
  departure lines (largest share 60%): "It is still warm where you were." 556, "Somebody came back for the umbrella." 200, "Somebody almost knocked." 109, "The chair, from the door." 42, "From over there it looked smaller." 19, "The light stays on." 4

## Coming back (second visits)

| arm | n | new answers vs first visit | painted memory | new painted memory | vignettes |
|---|---|---|---|---|---|
| base | 60 | 60% | 47% | 42% | 1.3 |
| P | 60 | 61% | 47% | 40% | 1.4 |
| R | 60 | 60% | 48% | 40% | 1.4 |
| AIR | 60 | 61% | 47% | 40% | 1.4 |
| DEP | 60 | 61% | 47% | 42% | 1.4 |
| D | 60 | 61% | 47% | 40% | 1.4 |
| EXIT | 60 | 57% | 47% | 42% | 1.5 |
| E | 60 | 60% | 28% | 23% | 1.3 |
| ALL | 60 | 60% | 42% | 38% | 1.3 |

## Visitors chosen to break things

| arm | visitor | per min | longest seen gap | voices | answered (all actions) | painted | false leave | leaving trace |
|---|---|---|---|---|---|---|---|---|
| base | speed-walker | 6.4 | 33.7 | 10.0 | 24% | 40% | 0 | 67% close |
| base | idle | 6.4 | 49.2 | 10.0 | 31% | 60% | 0 | 0% close |
| base | tap-spammer | 7.1 | 39.7 | 16.0 | 27% | 93% | 0 | 93% close |
| base | kneel-anywhere | 7.0 | 45.7 | 15.0 | 27% | 73% | 0 | 100% close |
| base | wall-hugger | 6.8 | 42.1 | 13.0 | 29% | 73% | 0 | 0% close |
| base | never-chair | 7.0 | 37.9 | 14.0 | 30% | 80% | 0 | 7% close |
| base | early-leaver | 7.4 | 21.6 | 2.0 | 30% | 0% | 0 | 73% close |
| base | floor-reader | 6.4 | 56.7 | 13.0 | 19% | 20% | 0 | 100% close |
| P | speed-walker | 6.4 | 40.6 | 8.0 | 20% | 27% | 0 | 53% close |
| P | idle | 6.4 | 49.2 | 10.0 | 31% | 60% | 0 | 0% close |
| P | tap-spammer | 6.7 | 44.2 | 16.0 | 26% | 93% | 0 | 100% close |
| P | kneel-anywhere | 6.6 | 53.2 | 14.0 | 26% | 53% | 0 | 100% close |
| P | wall-hugger | 6.6 | 45.7 | 12.0 | 28% | 93% | 0 | 0% close |
| P | never-chair | 6.7 | 44.4 | 14.0 | 29% | 67% | 0 | 20% close |
| P | early-leaver | 7.6 | 20.5 | 3.0 | 31% | 0% | 0 | 73% close |
| P | floor-reader | 6.3 | 56.7 | 12.0 | 17% | 20% | 0 | 100% close |
| R | speed-walker | 6.6 | 39.0 | 9.0 | 23% | 20% | 0 | 60% close |
| R | idle | 6.4 | 49.2 | 10.0 | 31% | 60% | 0 | 0% close |
| R | tap-spammer | 7.1 | 45.7 | 16.0 | 28% | 93% | 0 | 93% close |
| R | kneel-anywhere | 6.8 | 46.4 | 15.0 | 25% | 53% | 0 | 100% close |
| R | wall-hugger | 6.7 | 41.7 | 12.0 | 30% | 73% | 0 | 0% close |
| R | never-chair | 6.9 | 43.7 | 14.0 | 31% | 80% | 0 | 27% close |
| R | early-leaver | 7.5 | 23.7 | 2.0 | 35% | 13% | 0 | 47% close |
| R | floor-reader | 6.3 | 56.7 | 13.0 | 18% | 20% | 0 | 100% close |
| AIR | speed-walker | 6.4 | 40.6 | 8.0 | 20% | 27% | 0 | 53% close |
| AIR | idle | 6.4 | 49.2 | 10.0 | 31% | 60% | 0 | 0% close |
| AIR | tap-spammer | 6.7 | 44.2 | 16.0 | 26% | 93% | 0 | 100% close |
| AIR | kneel-anywhere | 6.6 | 52.9 | 14.0 | 26% | 60% | 0 | 100% close |
| AIR | wall-hugger | 6.6 | 45.7 | 12.0 | 28% | 93% | 0 | 0% close |
| AIR | never-chair | 6.7 | 44.4 | 14.0 | 29% | 67% | 0 | 20% close |
| AIR | early-leaver | 7.6 | 20.5 | 3.0 | 31% | 0% | 0 | 73% close |
| AIR | floor-reader | 6.2 | 56.9 | 12.0 | 17% | 27% | 0 | 100% close |
| DEP | speed-walker | 6.4 | 40.6 | 8.0 | 20% | 27% | 0 | 53% close |
| DEP | idle | 6.4 | 49.2 | 10.0 | 31% | 60% | 0 | 0% close |
| DEP | tap-spammer | 6.7 | 44.2 | 16.0 | 26% | 93% | 0 | 93% close |
| DEP | kneel-anywhere | 6.8 | 45.9 | 15.0 | 25% | 53% | 0 | 87% close |
| DEP | wall-hugger | 6.6 | 45.7 | 12.0 | 28% | 93% | 0 | 0% close |
| DEP | never-chair | 6.7 | 44.4 | 14.0 | 29% | 67% | 0 | 0% close |
| DEP | early-leaver | 7.6 | 20.5 | 3.0 | 31% | 0% | 0 | 47% close |
| DEP | floor-reader | 6.3 | 56.7 | 12.0 | 17% | 20% | 0 | 100% close |
| D | speed-walker | 6.4 | 40.6 | 8.0 | 20% | 27% | 0 | 60% close |
| D | idle | 6.4 | 48.3 | 10.0 | 32% | 60% | 0 | 0% close |
| D | tap-spammer | 6.7 | 49.4 | 16.0 | 26% | 93% | 0 | 100% close |
| D | kneel-anywhere | 6.6 | 53.2 | 14.0 | 26% | 60% | 0 | 100% close |
| D | wall-hugger | 6.6 | 45.7 | 12.0 | 28% | 93% | 0 | 0% close |
| D | never-chair | 6.7 | 44.4 | 14.0 | 29% | 67% | 0 | 20% close |
| D | early-leaver | 7.6 | 20.5 | 3.0 | 31% | 0% | 0 | 73% close |
| D | floor-reader | 6.3 | 56.7 | 12.0 | 17% | 20% | 0 | 100% close |
| EXIT | speed-walker | 6.5 | 40.7 | 8.0 | 20% | 27% | 0 | 60% close |
| EXIT | idle | 6.4 | 47.8 | 10.0 | 33% | 60% | 0 | 0% close |
| EXIT | tap-spammer | 6.9 | 49.0 | 16.0 | 28% | 80% | 0 | 80% close |
| EXIT | kneel-anywhere | 6.5 | 43.3 | 14.0 | 27% | 73% | 0 | 100% close |
| EXIT | wall-hugger | 6.5 | 45.7 | 12.0 | 28% | 87% | 0 | 0% close |
| EXIT | never-chair | 6.5 | 41.9 | 13.0 | 29% | 93% | 0 | 0% close |
| EXIT | early-leaver | 7.6 | 20.5 | 3.0 | 31% | 0% | 0 | 47% close |
| EXIT | floor-reader | 6.4 | 56.7 | 12.0 | 17% | 7% | 0 | 100% close |
| E | speed-walker | 6.7 | 33.7 | 9.0 | 25% | 53% | 0 | 67% close |
| E | idle | 6.5 | 46.4 | 10.0 | 33% | 60% | 0 | 0% close |
| E | tap-spammer | 7.1 | 41.2 | 14.0 | 26% | 93% | 0 | 100% close |
| E | kneel-anywhere | 7.0 | 39.8 | 14.0 | 27% | 73% | 0 | 100% close |
| E | wall-hugger | 7.1 | 44.9 | 13.0 | 30% | 87% | 0 | 0% close |
| E | never-chair | 6.9 | 38.5 | 13.0 | 31% | 80% | 0 | 20% close |
| E | early-leaver | 7.0 | 21.6 | 2.0 | 31% | 7% | 0 | 73% close |
| E | floor-reader | 6.5 | 56.7 | 12.0 | 17% | 33% | 0 | 100% close |
| ALL | speed-walker | 6.7 | 39.3 | 8.0 | 23% | 27% | 0 | 60% close |
| ALL | idle | 6.6 | 46.4 | 10.0 | 34% | 53% | 0 | 0% close |
| ALL | tap-spammer | 7.3 | 41.7 | 15.0 | 27% | 87% | 0 | 87% close |
| ALL | kneel-anywhere | 7.0 | 51.7 | 14.0 | 27% | 73% | 0 | 87% close |
| ALL | wall-hugger | 7.0 | 45.5 | 13.0 | 30% | 73% | 0 | 0% close |
| ALL | never-chair | 6.8 | 49.0 | 14.0 | 31% | 80% | 0 | 0% close |
| ALL | early-leaver | 7.6 | 23.7 | 2.0 | 38% | 20% | 0 | 27% close |
| ALL | floor-reader | 6.5 | 56.7 | 12.0 | 19% | 40% | 0 | 100% close |
