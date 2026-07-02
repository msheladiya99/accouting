import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Ledger } from "../models/Ledger";
import { bulkDeleteLedgers } from "../controllers/ledgerController";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function test() {
  await connectDB();

  // Find the ledger IDs
  const targetNames = ["KATHIRIYA KARAN ASHVINKUMAR", "GORDHANBHAILALJI BHAIJODHANI"];
  const ledgers = await Ledger.find({
    ledgerName: { $in: targetNames }
  });

  const ids = ledgers.map(l => l._id.toString());
  console.log("Ledger IDs to delete:", ids);

  // Mock req and res
  const req: any = {
    body: { ids },
    companyId: "6a2abc4a88a8ad516f0938de",
    company: { _id: "6a2abc4a88a8ad516f0938de" }
  };

  let statusNum = 200;
  let jsonRes: any = null;

  const res: any = {
    status(code: number) {
      statusNum = code;
      return this;
    },
    json(data: any) {
      jsonRes = data;
    }
  };

  await bulkDeleteLedgers(req, res);

  console.log("Resulting Status:", statusNum);
  console.log("Resulting JSON Response:", JSON.stringify(jsonRes, null, 2));

  await mongoose.disconnect();
}

test();
