import express from "express";
import { checkEligibility, getMysteryBoxList, updateMysteryBox } from "../controllers/mystery-box";
import authenticate from "../middleware/auth";
import checkDomain from "../middleware/domain";

const router = express.Router();

router.get("/check-eligibility", authenticate, checkEligibility);
router.get("/list", authenticate, getMysteryBoxList);
router.put("/update", authenticate, checkDomain, updateMysteryBox);

export default router;

