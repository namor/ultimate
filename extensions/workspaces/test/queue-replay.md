| scenario                                   | mode | slot-hold min | stuck behind | user clicks | CI runs wasted | minutes to merge (per entry)   |
| ------------------------------------------ | ---- | ------------: | -----------: | ----------: | -------------: | ------------------------------ |
| 1. CI fix behind blocked head (2026-11-09) | OLD  |            16 |            2 |           1 |              1 | A: -, B: 22, C: 29             |
| 1. CI fix behind blocked head (2026-11-09) | NEW  |             1 |            0 |           0 |              1 | A: -, B: 8, C: 15              |
| 2. Runner never acquired                   | OLD  |           149 |            0 |           1 |              1 | A: -                           |
| 2. Runner never acquired                   | NEW  |            70 |            0 |           0 |              0 | A: 74                          |
| 3a. One runner timeout                     | OLD  |           149 |            0 |           0 |              1 | A: -                           |
| 3a. One runner timeout                     | NEW  |             3 |            0 |           0 |              0 | A: 6                           |
| 3b. Two runner timeouts                    | OLD  |           149 |            0 |           0 |              1 | A: -                           |
| 3b. Two runner timeouts                    | NEW  |             4 |            0 |           0 |              0 | A: 8                           |
| 3c. Three runner timeouts                  | OLD  |           149 |            1 |           0 |              1 | A: -, C: -                     |
| 3c. Three runner timeouts                  | NEW  |             4 |            0 |           0 |              3 | A: -, C: 13                    |
| 4. Externally merged PR                    | OLD  |           149 |            1 |           0 |              0 | A: -, B: -                     |
| 4. Externally merged PR                    | NEW  |             1 |            0 |           0 |              0 | A: 0, B: 7                     |
| 5. Base moved                              | OLD  |             4 |            0 |           1 |              1 | A: 4, B: -, B': 16             |
| 5. Base moved                              | NEW  |             3 |            0 |           0 |              0 | A: 4, B: 12                    |
| 6. Two green low-risk PRs                  | OLD  |             2 |            0 |           0 |              0 | A: 6, B: 13                    |
| 6. Two green low-risk PRs                  | NEW  |             2 |            0 |           0 |              0 | A: 6, B: 13                    |
| 7. PR #33 (2026-11-20)                     | OLD  |            16 |            2 |           1 |              1 | A: -, C: 22, A2: 29            |
| 7. PR #33 (2026-11-20)                     | NEW  |             3 |            0 |           0 |              1 | A: -, C: 8, A2: 15             |
| 8. Medium approval waits 120 min           | OLD  |           123 |            3 |           1 |              0 | A: 121, B: 128, C: 135, D: 142 |
| 8. Medium approval waits 120 min           | NEW  |             1 |            0 |           0 |              1 | A: 127, B: 6, C: 13, D: 20     |

Times show when the lander confirmed each merge, in simulated minutes from the start. A dash means no merge was confirmed before minute 150. Slot-hold time counts minutes when the head kept the slot without progress.

In 3c, NEW spends three CI runs on A. OLD spends one. Both automatic retries time out.
