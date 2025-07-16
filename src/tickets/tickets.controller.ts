import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { Company } from '../../db/models/Company';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { User, UserRole } from '../../db/models/User';

interface newTicketDto {
  type: TicketType;
  companyId: number;
}

interface TicketDto {
  id: number;
  type: TicketType;
  companyId: number;
  assigneeId: number;
  status: TicketStatus;
  category: TicketCategory;
}

@Controller('api/v1/tickets')
export class TicketsController {
  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() newTicketDto: newTicketDto) {
    const { type, companyId } = newTicketDto;

    const category = this.resolveCategory(type);
    const userRole = this.resolveUserRole(type);

    const assignees = await User.findAll({
      where: { companyId, role: userRole },
      order: [['createdAt', 'DESC']],
    });
    let assignee = assignees[0];

    const tikets = await Ticket.findAll({
      where: { companyId, type: TicketType.registrationAddressChange },
    });
    if (type === TicketType.managementReport) {
      if (tikets.length > 0) {
        throw new ConflictException(
          'Cannot create a registration address change ticket. A ticket of this type already exists.',
        );
      }
    }

    if (type === TicketType.registrationAddressChange && tikets.length > 0) 
      throw new ConflictException(
        `Multiple tickets with type ${type}. Cannot create a ticket`,
      );

    if (!assignees.length) {
      if (userRole === UserRole.corporateSecretary && type === TicketType.registrationAddressChange) {
        const directors = await User.findAll({
          where: { companyId, role: UserRole.director },
        });
        if (directors.length > 1)
          throw new ConflictException(
            `Multiple directors found for company with id ${companyId}. Cannot create a ticket of type ${type}.`,
          );

        if (!directors.length)
          throw new ConflictException(
            `Cannot find user with role ${UserRole.director} to create a ticket`,
          );
        
        assignee = directors[0];
      } else {
        throw new ConflictException(
          `Cannot find user with role ${userRole} to create a ticket`,
        );
      }
    }

    if (userRole === UserRole.corporateSecretary && assignees.length > 1)
      throw new ConflictException(
        `Multiple users with role ${userRole}. Cannot create a ticket`,
      );

    if (type === TicketType.strikeOff) {
      if (assignees.length > 1) {
        throw new ConflictException(
          `Multiple directors found for company ${companyId}. Cannot assign strikeOff ticket.`,
        );
      }
    }

    if (type === TicketType.strikeOff) {
      await Ticket.update(
        { status: TicketStatus.resolved },
        {
          where: {
            companyId,
            status: TicketStatus.open,
          },
        },
      );
    }

    const status =
      type === TicketType.strikeOff ? TicketStatus.resolved : TicketStatus.open;

    const ticket = await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status,
    });

    const ticketDto: TicketDto = {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };

    return ticketDto;
  }

  private resolveUserRole(type: TicketType): UserRole {
    switch (type) {
      case TicketType.managementReport:
        return UserRole.accountant;
      case TicketType.registrationAddressChange:
        return UserRole.corporateSecretary;
      case TicketType.strikeOff:
        return UserRole.director;
      default:
        throw new ConflictException(`Unknown ticket type: ${type}`);
    }
  }

  private resolveCategory(type: TicketType): TicketCategory {
    switch (type) {
      case TicketType.managementReport:
        return TicketCategory.accounting;
      case TicketType.registrationAddressChange:
        return TicketCategory.corporate;
      case TicketType.strikeOff:
        return TicketCategory.management;
      default:
        throw new ConflictException(`Unknown ticket type: ${type}`);
    }
  }
}
