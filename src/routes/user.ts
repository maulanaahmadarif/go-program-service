import express from "express";

// import authenticate from '../middleware/auth';
import {
  userLogin,
  userSignup,
  getUserProfile,
  getUserList,
  forgotPassword,
  resetPassword,
  updateUser,
  userSignupConfirmation,
  addInternalUser,
  deleteUser,
  activateUser,
  bulkGenerateReferralCodes,
  downloadUserList,
  getReferredUsers,
  getReferralCodeUsers,
  getCurrentUserReferrals,
} from "../controllers/user";
import authenticate from "../middleware/auth";
import checkDomain from "../middleware/domain";
import checkEmailDomain from "../middleware/emailDomain";

const router = express.Router();

router.post("/login", checkEmailDomain, userLogin);
router.post("/signup", checkEmailDomain, userSignup);
// router.post('/add-internal-user', addInternalUser)
router.get("/profile", authenticate, getUserProfile);
router.get("/list", getUserList);
router.get("/referred", authenticate, getReferredUsers);
router.get("/referral-codes", authenticate, getReferralCodeUsers);
router.get("/my-referrals", authenticate, getCurrentUserReferrals);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/update", authenticate, updateUser);
router.get("/confirmation/:token", userSignupConfirmation);
router.delete("/delete/:user_id", authenticate, deleteUser);
router.post("/activate", authenticate, activateUser);
// router.post('/bulk-generate-referral-codes', bulkGenerateReferralCodes)
router.get("/download", downloadUserList);

export default router;
