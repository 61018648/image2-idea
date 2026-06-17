-- MySQL dump 10.13  Distrib 5.7.26, for Win64 (x86_64)
--
-- Host: localhost    Database: image-test
-- ------------------------------------------------------
-- Server version	5.7.26

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `_prisma_migrations`
--

DROP TABLE IF EXISTS `_prisma_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int(10) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `_prisma_migrations`
--

LOCK TABLES `_prisma_migrations` WRITE;
/*!40000 ALTER TABLE `_prisma_migrations` DISABLE KEYS */;
INSERT INTO `_prisma_migrations` VALUES ('09a9bf77-f4eb-4ace-8e06-f8b58b24e45a','2706dd9f87db11cea8df16d3cf09d0cbd85dfa7bd9fe52f80cb4a564b41fc8de',NULL,'000001_init','A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 000001_init\n\nDatabase error code: 1064\n\nDatabase error:\nYou have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near \'\"public\";\r\n\r\n-- CreateTable\r\nCREATE TABLE \"user_accounts\" (\r\n    \"id\" TEXT NOT N\' at line 2\n\nPlease check the query number 1 from the migration file.\n\n','2026-06-17 16:23:45.054','2026-06-17 16:18:52.302',0),('5ecfe124-769f-4fc6-aa3d-6e1ac91f0eb9','3cd568a11ed6109eb70949137a6394b7247edc9d28305589b2b572f64ba77f68',NULL,'000001_init','A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 000001_init\n\nDatabase error code: 1071\n\nDatabase error:\nSpecified key was too long; max key length is 1000 bytes\n\nPlease check the query number 6 from the migration file.\n\n','2026-06-17 16:27:34.201','2026-06-17 16:24:00.528',0),('3459a85e-02f1-4fe6-a874-e478598b7bbb','8510cfac8c8f3f474de1db54ecf24c27a4a8c0f98d936bd6727fc339a609f5d9','2026-06-17 16:28:55.670','000001_init',NULL,NULL,'2026-06-17 16:28:55.649',1);
/*!40000 ALTER TABLE `_prisma_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `balances`
--

DROP TABLE IF EXISTS `balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `balances` (
  `user_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `available_credits` int(11) NOT NULL DEFAULT '0',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `balances`
--

LOCK TABLES `balances` WRITE;
/*!40000 ALTER TABLE `balances` DISABLE KEYS */;
INSERT INTO `balances` VALUES ('usr_53ac0593004948498d1955fdd2e67234',0,'2026-06-17 16:36:01.308'),('usr_8a6f80081f3e470b943e0e9332646527',100,'2026-06-17 16:36:32.453'),('usr_4c7974b6f3b94934a489b6501a6792e6',0,'2026-06-17 22:51:38.249'),('usr_e41c4fd466ce4cc19d06a49cbfaf4e3d',0,'2026-06-17 23:27:14.023');
/*!40000 ALTER TABLE `balances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `credit_ledger`
--

DROP TABLE IF EXISTS `credit_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `credit_ledger` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int(11) NOT NULL,
  `balance_after` int(11) NOT NULL,
  `source` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `credit_ledger_source_id_key` (`source_id`),
  KEY `credit_ledger_user_id_created_at_idx` (`user_id`,`created_at`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `credit_ledger`
--

LOCK TABLES `credit_ledger` WRITE;
/*!40000 ALTER TABLE `credit_ledger` DISABLE KEYS */;
INSERT INTO `credit_ledger` VALUES ('led_85w101qg','usr_8a6f80081f3e470b943e0e9332646527','purchase',100,100,'payment_notify','ord_8sny02vi','Purchase dev-small','2026-06-17 16:36:32.453');
/*!40000 ALTER TABLE `credit_ledger` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `generation_jobs`
--

DROP TABLE IF EXISTS `generation_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `generation_jobs` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `prompt` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_params` json NOT NULL,
  `input_image_data` json NOT NULL,
  `mask_data_url` longtext COLLATE utf8mb4_unicode_ci,
  `cost_credits` int(11) NOT NULL,
  `images` json NOT NULL,
  `raw_image_urls` json DEFAULT NULL,
  `revised_prompts` json DEFAULT NULL,
  `actual_params` json DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `started_at` datetime(3) DEFAULT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `generation_jobs_user_id_created_at_idx` (`user_id`,`created_at`),
  KEY `generation_jobs_status_created_at_idx` (`status`,`created_at`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `generation_jobs`
--

LOCK TABLES `generation_jobs` WRITE;
/*!40000 ALTER TABLE `generation_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `generation_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `orders` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `amount_cents` int(11) NOT NULL,
  `currency` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `credits` int(11) NOT NULL,
  `provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_order_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider_payment_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `paid_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `orders_user_id_created_at_idx` (`user_id`,`created_at`),
  KEY `orders_plan_id_fkey` (`plan_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES ('ord_vq943xik','usr_53ac0593004948498d1955fdd2e67234','dev-small','pending',500,'USD',100,'dev',NULL,NULL,'2026-06-17 16:36:01.343',NULL),('ord_8sny02vi','usr_8a6f80081f3e470b943e0e9332646527','dev-small','paid',500,'USD',100,'dev',NULL,NULL,'2026-06-17 16:36:32.441','2026-06-17 16:36:32.449'),('ord_ghqfo50v','usr_4c7974b6f3b94934a489b6501a6792e6','dev-medium','pending',2000,'USD',500,'stripe',NULL,NULL,'2026-06-17 22:54:36.360',NULL);
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_events`
--

DROP TABLE IF EXISTS `payment_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_events` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_event_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `raw` json NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_events_provider_provider_event_id_key` (`provider`,`provider_event_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_events`
--

LOCK TABLES `payment_events` WRITE;
/*!40000 ALTER TABLE `payment_events` DISABLE KEYS */;
INSERT INTO `payment_events` VALUES ('evt_33imd3e4','dev','evt-smoke-ord_8sny02vi','ord_8sny02vi','2026-06-17 16:36:32.449','{\"orderId\": \"ord_8sny02vi\", \"provider\": \"dev\", \"paidAmountCents\": 500, \"providerEventId\": \"evt-smoke-ord_8sny02vi\"}');
/*!40000 ALTER TABLE `payment_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plans`
--

DROP TABLE IF EXISTS `plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plans` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `credits` int(11) NOT NULL,
  `price_cents` int(11) NOT NULL,
  `currency` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plans`
--

LOCK TABLES `plans` WRITE;
/*!40000 ALTER TABLE `plans` DISABLE KEYS */;
INSERT INTO `plans` VALUES ('dev-small','Small',100,500,'USD',1,'2026-06-17 16:31:36.123','2026-06-17 23:27:41.196'),('dev-medium','Medium',500,2000,'USD',1,'2026-06-17 16:31:36.128','2026-06-17 23:27:41.198'),('dev-free','Free Trial',20,0,'USD',1,'2026-06-17 16:31:36.129','2026-06-17 23:27:41.199');
/*!40000 ALTER TABLE `plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_accounts`
--

DROP TABLE IF EXISTS `user_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_accounts` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `last_login_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_accounts_email_key` (`email`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_accounts`
--

LOCK TABLES `user_accounts` WRITE;
/*!40000 ALTER TABLE `user_accounts` DISABLE KEYS */;
INSERT INTO `user_accounts` VALUES ('usr_53ac0593004948498d1955fdd2e67234','smoke+1781714161227@example.com','scrypt:hdN4hsFvEThPOoayGxflrw:JpIE-kK2ezE1jetyKthKRkCqES2EBhhqiTBTMLl7sBtq5PsUNoEq6vWkpclSlrPXVO3V4IrySpDOWJQmfFW6Nw','smoke+1781714161227','user','active','2026-06-17 16:36:01.306','2026-06-17 16:36:01.308','2026-06-17 16:36:01.308'),('usr_8a6f80081f3e470b943e0e9332646527','smoke+1781714192339@example.com','scrypt:O89P3qgMSt-tB00pd-iMpQ:opdzk0VfK0Xe9bN5Di4QXxkJLl6umMbM9Tg6q9Wl_4NK8__Y8ecsRsGI3hrqLHS8XvP1FFjySAaxqrsTFopW3g','smoke+1781714192339','user','active','2026-06-17 16:36:32.408','2026-06-17 16:36:32.410','2026-06-17 16:36:32.410'),('usr_4c7974b6f3b94934a489b6501a6792e6','codex-commercial-test@example.com','scrypt:AEKniigbcAYjRPPdoKcLVg:ZI0UDrQcTBHu4Of29WWjSmetzQkZ1E6oyJ1XX_7aHzfbbVzm51t189-K2JhNXSi3eojwb3FzvFsT6zR6MnVXXg','codex-commercial-test','user','active','2026-06-17 22:51:38.248','2026-06-17 22:51:38.249','2026-06-17 22:51:38.249'),('usr_e41c4fd466ce4cc19d06a49cbfaf4e3d','admin@admin.com','scrypt:Rcec3BBSka01BR02F4zF1w:yWOMl4jNboi1D9323qrJ-PPkT4b-8ylh2tg7lJxvBRGVKRy3xLxmy2FHrSioGRbB9dn2RUUj1VRj61LqyLQeZQ','admin','user','active','2026-06-17 23:27:36.481','2026-06-17 23:27:14.023','2026-06-17 23:27:36.483');
/*!40000 ALTER TABLE `user_accounts` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-18  7:30:29
