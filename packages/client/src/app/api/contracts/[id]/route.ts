import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id: contractId } = await params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    return NextResponse.json({ error: 'Failed to fetch contract' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id: contractId } = await params;
    const data = await request.json();

    // Validate that status is provided
    if (!data.status) {
      return NextResponse.json({ error: 'Status field is required' }, { status: 400 });
    }

    console.log(`Updating contract ${contractId} status to: ${data.status}`);

    // Prepare update data object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      status: data.status,
    };

    // Add indemnification clause if provided
    if (data.indemnificationText) {
      updateData.indemnificationText = data.indemnificationText;
    }

    // Add termination clause if provided
    if (data.terminationText) {
      updateData.terminationText = data.terminationText;
    }

    // Update the contract with all provided fields
    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
      data: updateData,
    });

    if (!updatedContract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json(updatedContract);
  } catch (error) {
    console.error('Error updating contract status:', error);
    // Handle specific Prisma errors
    if ((error as import('@prisma/client').Prisma.PrismaClientKnownRequestError).code === 'P2025') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to update contract status' }, { status: 500 });
  }
}
