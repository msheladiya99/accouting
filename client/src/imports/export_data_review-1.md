# Miracle Accounting Software Export Data Review

This document provides a comprehensive review of the exported accounting data located in the folder [SYNC-CMP0034](file:///c:/Users/DELL/Downloads/SYNC-CMP0034). The files in this export are dBase/FoxPro database files (`.dbf`), which are typical for Miracle Accounting Software.

---

## 📊 Summary of Accounting Entries

There are exactly **7 active accounting transactions (vouchers)** exported in this folder. These vouchers correspond to sales/service invoices billed to different bank clients for concurrent audit fees. 

The double-entry ledger posting of these 7 vouchers results in **28 individual accounting postings (debits and credits)**.

Here is the key summary of the entries:
* **Voucher Headers (`rkacct41.dbf`)**: **7 entries** (one per invoice)
* **Double-Entry Ledger Postings (`rkacct01.dbf`)**: **28 entries** (each voucher has 1 Debit to Bank/Customer and 3 Credits: Revenue, CGST, and SGST)
* **Voucher Line Items (`rkacct52.dbf`)**: **14 entries** (each voucher contains 2 service/item lines)
* **Voucher Narrations (`rkacct02.dbf`)**: **7 entries** (contains specific descriptions for each invoice)
* **Bill-Wise/Outstanding References (`rkacct05.dbf`)**: **28 entries** (24 representing opening outstanding bills from previous periods, and 4 representing current outstanding bill references)

---

## 📋 List of Accounting Vouchers (Transactions)

Below is the list of all **7 accounting vouchers** found in the export data:

| No. | Voucher No | Date | Party / Client Name | Taxable Amt (Rs.) | CGST (Rs.) | SGST (Rs.) | Net Amt (Rs.) | Narration |
| :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **1** | GT/ 2 | 15-04-2026 | Union Bank Of India | 40,000.00 | 3,600.00 | 3,600.00 | **47,200.00** | Concurrent audit fees for the month of March 2026 of Nanpura branch |
| **2** | GT/ 3 | 16-04-2026 | Bank Of Baroda (Kribhco Township Branch) | 35,000.00 | 3,150.00 | 3,150.00 | **41,300.00** | Concurrent audit fees for the month of January 2026 of Kribhco township branch |
| **3** | GT/ 4 | 16-04-2026 | Bank Of Baroda (Kribhco Township Branch) | 35,000.00 | 3,150.00 | 3,150.00 | **41,300.00** | Concurrent audit fees for the month of February 2026 of Kribhco township branch |
| **4** | GT/ 5 | 25-04-2026 | Bank Of Baroda (Kribhco Township Branch) | 35,000.00 | 3,150.00 | 3,150.00 | **41,300.00** | Concurrent audit fees for the month of March 2026 of Kribhco township branch |
| **5** | GT/ 6 | 26-04-2026 | BANK OF INDIA - VAPI | 32,000.00 | 2,880.00 | 2,880.00 | **37,760.00** | Concurrent audit fees for the month of February 2026 |
| **6** | GT/ 7 | 26-04-2026 | BANK OF INDIA - VAPI | 32,000.00 | 2,880.00 | 2,880.00 | **37,760.00** | Concurrent audit fees for the month of March 2026 |
| **7** | GT/ 8 | 26-04-2026 | CENTRAL BANK OF INDIA - AUDIT | 30,000.00 | 2,700.00 | 2,700.00 | **35,400.00** | Concurrent audit fees for the month of March 2026 |
| **Total** | | | | **239,000.00** | **21,510.00** | **21,510.00** | **282,020.00** | |

---

## 🗃️ Complete File Inventory & Records Count

Here is a list of all DBF files included in the export folder and what they contain:

### 1. Transaction Tables (Prefix `rkacct*`)
* [rkacct41.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct41.dbf) (**7 records**): Voucher headers (e.g. voucher number, date, amounts, client code).
* [rkacct01.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct01.dbf) (**28 records**): General Ledger Posting lines (debits/credits for accounts).
* [rkacct52.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct52.dbf) (**14 records**): Item/service lines, including tax distribution (CGST/SGST/IGST).
* [rkacct02.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct02.dbf) (**7 records**): Line items/voucher description narrations.
* [rkacct05.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct05.dbf) (**28 records**): Bill-by-bill outstanding reference mappings (24 from opening/previous period, 4 from current invoices).
* [rkacct14.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct14.dbf) (**7 records**), [rkacct40.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct40.dbf) (**7 records**), [rkacct46.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct46.dbf) (**7 records**), [rkacct53.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacct53.dbf) (**7 records**): Internal system tags, flags, and voucher metadata.

### 2. Master Data Tables (Prefix `rkaccm*` & `rkgstr*`)
* [rkaccm01.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm01.dbf) (**10 records**): Ledger Account Master (contains Bank Clients and Revenue/GST accounts).
* [rkaccm02.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm02.dbf) (**4 records**): Account Group Master.
* [rkaccm08.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm08.dbf) (**3 records**): Cost Center Master.
* [rkaccm11.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm11.dbf) (**9 records**): Product / Item Master.
* [rkaccm12.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm12.dbf) (**5 records**): Product Group Master.
* [rkaccm13.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm13.dbf) (**1 record**): Unit of Measurement Master.
* [rkaccm14.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm14.dbf) (**1 record**): Item Category Master.
* [rkaccm17.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm17.dbf) (**1 record**): Bank Branch Master.
* [rkaccm18.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm18.dbf) (**1 record**): State/Region Master.
* [rkaccm21.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm21.dbf) (**1 record**): Tax Class Master.
* [rkaccm29.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm29.dbf) (**1 record**): Narration template master.
* [rkaccm41.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm41.dbf) (**1 record**): Invoice / Purchase Type configuration.
* [rkaccm45.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm45.dbf) (**7 records**): HSN/SAC Code Master.
* [rkaccm51.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm51.dbf) (**1 record**): Invoice Numbering Series Master.
* [rkaccm81.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccm81.dbf) (**2 records**): Currency Master.
* [rkaccmxx.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccmxx.dbf) (**54 records**): System configurations.
* [rkgstr05.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkgstr05.dbf) (**2 records**): GSTIN details of Clients.

### 3. Sync & Tracking Tables
* [codecursor.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/codecursor.dbf) (**274 records**): Internal mappings of synced tables and record GUIDs.
* [rkacamb1.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkacamb1.dbf) (**10 records**): Monthly ledger balance history/opening balances.
* [rkaccgid.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/rkaccgid.dbf) (**69 records**): GUID mappings for ledgers/groups.
* [syncexpinfo.dbf](file:///c:/Users/DELL/Downloads/SYNC-CMP0034/syncexpinfo.dbf) (**10 records**): System synchronization info.

---

> [!NOTE]
> All the vouchers in this export are dated between **15-04-2026 and 26-04-2026** and pertain to the financial year 2026-27.
