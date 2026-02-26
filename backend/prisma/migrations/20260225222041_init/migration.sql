-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FARMER', 'BUYER', 'DRIVER', 'TRADER');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'KN', 'HI', 'MR');

-- CreateEnum
CREATE TYPE "QualityGrade" AS ENUM ('GRADE_A', 'GRADE_B', 'MIXED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'FULFILLED', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'TRANSPORT_BOOKED', 'LOADED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BuyerPaymentStatus" AS ENUM ('PENDING', 'STAGE1_PAID', 'STAGE2_PAID', 'SETTLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SellerPaymentStatus" AS ENUM ('WAITING', 'STAGE1_RELEASED', 'FULLY_SETTLED', 'HOLD', 'FORFEITED');

-- CreateEnum
CREATE TYPE "DriverPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('DAILY_SUPPLY_CHAIN', 'PERSONAL_SUPPLY_LINE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('AVAILABLE', 'ACCEPTED', 'EN_ROUTE_FARM', 'LOADED', 'EN_ROUTE_BUYER', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'EN',
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fcmToken" TEXT,
    "location" TEXT,
    "cropsGrown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "businessName" TEXT,
    "businessType" TEXT,
    "gstin" TEXT,
    "deliveryAddress" TEXT,
    "vehicleType" TEXT,
    "vehicleCapacity" DOUBLE PRECISION,
    "vehicleReg" TEXT,
    "licenseUrl" TEXT,
    "workMode" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "cropType" TEXT NOT NULL,
    "quantityKg" DOUBLE PRECISION NOT NULL,
    "remainingKg" DOUBLE PRECISION NOT NULL,
    "harvestDate" TIMESTAMP(3) NOT NULL,
    "qualityGrade" "QualityGrade" NOT NULL,
    "askingPrice" DOUBLE PRECISION NOT NULL,
    "aiPredictedPrice" DOUBLE PRECISION,
    "mandiRefPrice" DOUBLE PRECISION,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "isTrader" BOOLEAN NOT NULL DEFAULT false,
    "aiGradePredicted" "QualityGrade",
    "aiGradeMismatch" BOOLEAN NOT NULL DEFAULT false,
    "aiImagesValid" BOOLEAN NOT NULL DEFAULT true,
    "targetMarket" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "cloudinaryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "quantityKg" DOUBLE PRECISION NOT NULL,
    "quantityActualKg" DOUBLE PRECISION,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "produceTotal" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "transportFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "buyerPaymentStatus" "BuyerPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "sellerPaymentStatus" "SellerPaymentStatus" NOT NULL DEFAULT 'WAITING',
    "driverPaymentStatus" "DriverPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "qualityRating" DOUBLE PRECISION,
    "packagingRating" DOUBLE PRECISION,
    "deliveryRating" DOUBLE PRECISION,
    "ratingComment" TEXT,
    "penaltyApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT,
    "transportMode" "TransportMode" NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'AVAILABLE',
    "loadedPhotoUrl" TEXT,
    "firestoreId" TEXT,
    "earnings" DOUBLE PRECISION NOT NULL,
    "routeId" TEXT,
    "scheduledTime" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "loadedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DscRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DscRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_orderId_key" ON "Trip"("orderId");

-- AddForeignKey
ALTER TABLE "OtpRecord" ADD CONSTRAINT "OtpRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
