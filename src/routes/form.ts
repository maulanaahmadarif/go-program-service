import express from "express";

// import authenticate from '../middleware/auth';
import {
	createFormType,
	formSubmission,
	getFormByProject,
	deleteForm,
	getFormSubmission,
	downloadSubmission,
	approveSubmission,
	getReport,
	getFormSubmissionByUserId,
	getFormTypeUsers,
	getChampions,
	enqueueBulkApprove,
	enqueueBulkReject,
	getBulkModerationJobStatus,
} from "../controllers/form";
import authenticate from "../middleware/auth";
import { cacheGet } from "../middleware/cache";
import checkDomain from "../middleware/domain";

const router = express.Router();

router.post("/create-form-type", createFormType);
router.post("/submit", authenticate, checkDomain, formSubmission);
router.get("/project", authenticate, getFormByProject);
router.delete("/delete/:form_id", authenticate, deleteForm);
router.get("/submission", authenticate, cacheGet({ keyPrefix: 'cache:form:submission', ttlSeconds: 30, includeUser: true }), getFormSubmission);
router.get("/submission/user", authenticate, getFormSubmissionByUserId);
router.get("/submission/type-users", authenticate, cacheGet({ keyPrefix: 'cache:form:type-users', ttlSeconds: 30, includeUser: true }), getFormTypeUsers);
router.get("/champions", cacheGet({ keyPrefix: 'cache:form:champions', ttlSeconds: 300 }), getChampions);
router.post("/approve/bulk", authenticate, enqueueBulkApprove);
router.post("/approve/:form_id", authenticate, approveSubmission);
router.post("/reject/bulk", authenticate, enqueueBulkReject);
router.get("/bulk-jobs/:jobId", authenticate, getBulkModerationJobStatus);
router.get("/submission/download", authenticate, downloadSubmission);
router.get("/submission/report", getReport);

export default router;
