import type { Messages } from './en';

/** Spanish UI strings. The `Messages` type makes a missing or extra key a type error. */
export const es: Messages = {
  'banner.text': 'Simulador educativo independiente — no está conectado a ninguna cuenta de AWS',

  'footer.trademark':
    'Amazon Web Services, AWS y las marcas relacionadas son marcas comerciales de Amazon.com, Inc. o sus filiales.',
  'footer.disclaimer':
    '{product} es un proyecto educativo independiente. No está afiliado, patrocinado ni respaldado por Amazon Web Services.',

  'top.logoAlt': 'Logotipo de {product}',
  'top.language': 'Idioma',

  'storage.backedUp':
    'No se pudo cargar la configuración guardada, así que la app empezó de cero. Se guardó una copia de respaldo de los datos anteriores en este navegador.',
  'storage.unreadable': 'No se pudo leer la configuración guardada, así que la app empezó de cero.',
  'storage.saveFailed':
    'No se pudo guardar la configuración en este navegador. Los cambios duran hasta que cierres la pestaña.',
  'storage.dismiss': 'Descartar',

  'home.labs.title': 'Laboratorios en curso',
  'home.labs.empty': 'No hay laboratorios en curso',
  'home.labs.emptyHint': 'Aquí aparecen los laboratorios que inicies.',
  'home.health.title': 'Estado de la topología',
  'home.health.ok': 'No se encontraron problemas',
  'home.health.issues_one': '{count} problema encontrado',
  'home.health.issues_other': '{count} problemas encontrados',
  'home.health.resources': 'Recursos en la topología',
  'home.health.vpcs': 'VPC',
  'home.health.subnets': 'Subredes',
  'home.health.instances': 'Instancias',
  'home.health.severity.error': 'Error',
  'home.health.severity.warning': 'Advertencia',
  'home.cost.title': 'Costo estimado de esta topología',
  'home.cost.empty': 'Todavía no hay una instantánea de precios',
  'home.cost.emptyHint':
    'Las estimaciones aparecen cuando el build incluya una instantánea fechada de AWS Price List.',

  'notFound.title': 'Página no encontrada',
  'notFound.hint': 'Esta dirección no coincide con ninguna página de la consola.',
  'notFound.home': 'Ir al inicio de la consola',

  'reference.notice': 'Solo referencia: este servicio no está simulado',
  'reference.noCard': 'Todavía no hay ficha.',
  'reference.docsLink': 'Documentación oficial',
  'reference.simulatedNotice': 'Este servicio está simulado',
  'reference.openConsole': 'Abrir la consola de {name}',
  'reference.details': 'Detalles',
  'reference.category': 'Categoría',
  'reference.examScope': 'Alcance de examen',
  'reference.examNone': 'No está en las listas de servicios incluidos de CLF-C02 ni SAA-C03',
  'reference.cardStatus': 'Estado de la ficha',
  'reference.card': 'Ficha de referencia',
  'reference.examCues': 'Señales de examen',
  'reference.notToConfuseWith': 'No confundir con',
  'reference.pricingModel': 'Modelo de precios',
  'reference.sharedResponsibility': 'Responsabilidad compartida',
  'reference.responsibilityAws': 'AWS',
  'reference.responsibilityCustomer': 'Cliente',
  'reference.sources': 'Fuentes',
  'reference.accessedOn': 'consultado el {date}',
  'storage.topology.backedUp':
    'No se pudo cargar la topología guardada, así que el sandbox empezó vacío. Se guardó una copia de respaldo en este navegador.',
  'storage.topology.unreadable':
    'No se pudo leer la topología guardada, así que el sandbox empezó vacío.',
  'storage.topology.saveFailed':
    'No se pudo guardar la topología en este navegador. Los cambios duran hasta que cierres la pestaña.',

  'fidelity.Exact': 'Exacto',
  'fidelity.Inferred': 'Inferido',
  'fidelity.Unsupported': 'No soportado',
  'fidelity.Exact.description': 'Coincide con una regla documentada de AWS.',
  'fidelity.Inferred.description':
    'Modelo del simulador para algo que AWS no explica en un solo lugar, o una simplificación.',
  'fidelity.Unsupported.description':
    'No se simula en esta versión. Nunca lo tomes como permitido, gratis o instantáneo.',
  'fidelity.title': 'Fidelidad del simulador: {label}',
  'fidelity.rules': 'Reglas: {ruleIds}',
  'fidelity.notSimulated': 'No se simula en esta versión',

  'change.rejected': 'AWS rechazaría este cambio',
  'change.failed': 'No se puede hacer este cambio',

  'helper.UNKNOWN_REFERENCE': '{id} ya no existe.',
  'helper.INVALID_INPUT': 'Algunos valores no son válidos: {details}',
  'helper.NO_FREE_PRIVATE_ADDRESS':
    'La subred {subnetId} ({cidrBlock}) no tiene direcciones IPv4 privadas libres.',
  'helper.PUBLIC_POOL_EXHAUSTED':
    'El pool simulado de IPv4 públicas ({pool}) no tiene direcciones libres.',
  'helper.IGW_ALREADY_ATTACHED':
    'El internet gateway {internetGatewayId} ya está conectado a {vpcId}.',
  'helper.VPC_ALREADY_HAS_IGW':
    '{vpcId} ya tiene el internet gateway {internetGatewayId}. Una VPC solo puede tener un internet gateway.',
  'helper.IGW_NOT_ATTACHED':
    'El internet gateway {internetGatewayId} no está conectado a ninguna VPC.',
  'helper.IGW_HAS_PUBLIC_ADDRESSES_one':
    'No se puede desconectar el internet gateway {internetGatewayId}: {vpcId} tiene {count} interfaz de red con IPv4 pública.',
  'helper.IGW_HAS_PUBLIC_ADDRESSES_other':
    'No se puede desconectar el internet gateway {internetGatewayId}: {vpcId} tiene {count} interfaces de red con IPv4 pública.',

  'issue.VPC_SIZE_INVALID':
    'El CIDR de VPC {cidrBlock} es un /{prefixLength}. Un CIDR de VPC debe estar entre /{minPrefixLength} y /{maxPrefixLength}.',
  'issue.VPC_CIDR_RESTRICTED':
    'El CIDR de VPC {cidrBlock} está dentro de {restrictedBlock}, que AWS no permite para una VPC.',
  'issue.SUBNET_SIZE_INVALID':
    'El CIDR de subred {cidrBlock} es un /{prefixLength}. Un CIDR de subred debe estar entre /{minPrefixLength} y /{maxPrefixLength}.',
  'issue.SUBNET_CIDR_OUT_OF_VPC':
    'El CIDR de subred {cidrBlock} no está dentro del CIDR de la VPC {vpcCidrBlock}.',
  'issue.CIDR_OVERLAP':
    'El CIDR de subred {cidrBlock} se solapa con {otherCidrBlock} de la subred {relatedId}.',
  'issue.IP_OUT_OF_SUBNET':
    'La dirección IPv4 privada {ipAddress} no está en la subred {subnetCidrBlock}.',
  'issue.IP_RESERVED':
    'La dirección IPv4 privada {ipAddress} está reservada en {subnetCidrBlock}: {purpose}.',
  'issue.IP_DUPLICATE.private': 'La dirección IPv4 privada {ipAddress} ya la usa {relatedId}.',
  'issue.IP_DUPLICATE.public': 'La dirección IPv4 pública {ipAddress} ya la usa {relatedId}.',
  'issue.PUBLIC_IP_INVALID.rfc1918':
    'La dirección IPv4 pública {ipAddress} es privada (RFC 1918, {range}), así que no puede ser pública.',
  'issue.PUBLIC_IP_INVALID.rfc6598':
    'La dirección IPv4 pública {ipAddress} está en el espacio compartido (RFC 6598, {range}), así que no puede ser pública.',
  'issue.PUBLIC_IP_INVALID.restricted':
    'La dirección IPv4 pública {ipAddress} está en el rango restringido {range}, así que no puede ser pública.',
  'issue.PUBLIC_IP_INVALID.vpc-cidr':
    'La dirección IPv4 pública {ipAddress} está dentro del CIDR de VPC {range}, así que no puede ser pública.',
  'issue.VPC_MISMATCH': '{resourceId} está en {vpcId}, pero {relatedId} pertenece a {otherVpcId}.',
  'issue.ROUTE_DUPLICATE_DESTINATION':
    'La tabla de rutas ya tiene una ruta hacia {destinationCidrBlock}.',
  'issue.ROUTE_DESTINATION_RESERVED':
    'El destino {destinationCidrBlock} está dentro de {reservedBlock}, que AWS reserva para sus propios servicios.',
  'issue.LOCAL_ROUTE_CONFLICT':
    'El destino {destinationCidrBlock} es el CIDR de la VPC {vpcCidrBlock} o está dentro de él. La ruta local ya lo cubre.',
  'issue.IGW_MULTIPLE_ATTACHED': '{vpcId} ya tiene conectado el internet gateway {relatedId}.',
  'issue.SG_NAME_INVALID.empty': 'El campo {field} del grupo de seguridad es obligatorio.',
  'issue.SG_NAME_INVALID.too-long':
    'El campo {field} del grupo de seguridad admite hasta {maxLength} caracteres.',
  'issue.SG_NAME_INVALID.invalid-characters':
    'El campo {field} del grupo de seguridad solo admite a-z, A-Z, 0-9, espacios y ._-:/()#,@[]+=&;{}!$*',
  'issue.SG_NAME_INVALID.sg-prefix':
    'El nombre de un grupo de seguridad no puede empezar con "sg-".',
  'issue.SG_NAME_DUPLICATE': 'Ya existe un grupo de seguridad llamado "{name}" en {vpcId}.',
  'issue.NACL_RULE_NUMBER_DUPLICATE':
    'El número de regla {ruleNumber} se usa dos veces en las reglas {direction}.',
  'issue.QUOTA_EXCEEDED.rules-per-security-group':
    'El grupo de seguridad tiene {count} reglas {direction}. La cuota por defecto es {limit}.',
  'issue.QUOTA_EXCEEDED.rules-per-network-acl':
    'La ACL de red tiene {count} reglas {direction}. La cuota por defecto es {limit}.',
  'issue.QUOTA_EXCEEDED.security-groups-per-network-interface':
    'La interfaz de red tiene {count} grupos de seguridad. La cuota por defecto es {limit}.',
  'issue.purpose.network': 'dirección de red',
  'issue.purpose.vpc-router': 'router de la VPC',
  'issue.purpose.dns': 'reservada por AWS (DNS)',
  'issue.purpose.future-use': 'reservada por AWS para uso futuro',
  'issue.purpose.broadcast': 'dirección de broadcast',
  'issue.field.name': 'nombre',
  'issue.field.description': 'descripción',
  'issue.direction.inbound': 'de entrada',
  'issue.direction.outbound': 'de salida',

  'sim.zoneNoPreference': '"No preference" elige la primera zona de disponibilidad de la región.',
  'sim.firstFreeAddress':
    'Si no eliges una dirección, el simulador toma la primera dirección utilizable libre de la subred.',
  'sim.publicPool':
    'Las IPv4 públicas simuladas salen de 203.0.113.0/24, un rango de documentación (RFC 5737).',
  'sim.subnetNoPreference': '"No preference" elige la primera subred de la VPC.',
  'sim.launchTime': 'El simulador no guarda la hora de lanzamiento.',
  'sim.amiPlatform': 'El simulador solo modela la plataforma de la imagen: Linux/UNIX o Windows.',
  'sim.software.title': 'Software simulado',
  'sim.software.description':
    'En AWS el software viene de la AMI o de los user data. Al simulador solo le importa qué servicio escucha en qué puerto.',
  'sim.software.none': 'Ninguno',
  'sim.software.webServer': 'Servidor web (nginx en el puerto TCP 80)',
};
